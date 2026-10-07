// src/modules/referrals/referrals.service.ts — referral program.

import crypto from 'node:crypto';
import { badRequest, forbidden } from '../../http/errors';
import { appendUtm } from '../../lib/utm';
import { config } from '../../config';
import type { Database } from '../../db/types';
import { createReferralsRepo, type ReferralsRepo } from './referrals.repo';

const REFERRAL_UTM = { source: 'referral_share', medium: 'share_link', campaign: 'referral_program' } as const;
const ACTIVATION_WINDOW_DAYS = 90;
const REWARD_GOLD = 200;
/**
 * Referrals that pay the referrer, per account, for the lifetime of the account.
 *
 * This was UNCAPPED, and it is the most farmable path in the app: the reward
 * triggers when the friend finishes a 9+ hole round, and a Throw Lab round is
 * simulated by the CLIENT, so fifty throwaway accounts each playing one round
 * was 10,000 gold -- about $143 of merchandise -- to whoever invited them.
 *
 * Ten is set to be generous for the real thing: inviting ten friends who each
 * actually play is a lot of genuine advocacy, and it still pays 2,000 gold
 * (~$29). Past the cap the referral STILL WORKS -- it is tracked, the friend
 * still gets their joining bonus, and it still counts on the referrals page --
 * the referrer simply stops being paid. Same shape as the check-in cap: the
 * reward is what is worth faking, not the row.
 */
export const MAX_REWARDED_REFERRALS = 10;
const FRIEND_BONUS_GOLD = 50;

function generateCode(): string {
  return crypto.randomBytes(6).toString('base64').replace(/[/+=]/g, 'X').toUpperCase().slice(0, 8);
}

function windowExpiresAt(): string {
  const d = new Date();
  d.setDate(d.getDate() + ACTIVATION_WINDOW_DAYS);
  return d.toISOString();
}

function referralUrl(code: string): string {
  return appendUtm(`${config.appBaseUrl}/register?ref=${code}`, REFERRAL_UTM);
}

export function createReferralsService(db: Database, repo: ReferralsRepo = createReferralsRepo(db)) {
  return {
    async getMe(playerId: number) {
      const [codeRows, activationRows, player] = await Promise.all([repo.codes(playerId), repo.activations(playerId), repo.playerNameGold(playerId)]);

      const codes = codeRows.map((row) => ({ code: row.code, referral_url: referralUrl(row.code), created_at: row.created_at }));
      const referrals = activationRows.map((row) => ({
        code_used: row.code_used,
        status: row.status,
        friend_name: row.friend_id ? row.friend_name : null,
        reward_type: row.reward_type,
        reward_amount: row.reward_amount,
        rewarded_at: row.rewarded_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
      }));

      const total_rewards_gold = referrals.filter((r) => r.status === 'rewarded' && r.reward_type === 'gold').reduce((s, r) => s + (r.reward_amount || 0), 0);

      return {
        codes,
        referrals,
        stats: {
          total_codes: codes.length,
          total_referrals_sent: referrals.length,
          activated_count: referrals.filter((r) => r.status === 'activated' || r.status === 'rewarded').length,
          rewarded_count: referrals.filter((r) => r.status === 'rewarded').length,
          total_rewards_gold,
        },
        player_name: player?.display_name,
        current_gold: player?.gold || 0,
        activation_window_days: ACTIVATION_WINDOW_DAYS,
        reward_description: `${REWARD_GOLD} gold when your friend completes a 9+ hole round`,
      };
    },

    async generate(playerId: number) {
      const existing = await repo.existingCode(playerId);
      if (existing) return { code: existing, referral_url: referralUrl(existing), already_existed: true };

      let code = generateCode();
      for (let i = 0; i < 10 && (await repo.codeTaken(code)); i++) code = generateCode();
      await repo.insertCode(playerId, code);
      return { code, referral_url: referralUrl(code), already_existed: false, status: 201 as const };
    },

    /** Returns the redirect target for a click (tracks the event as a side effect). */
    async clickTarget(codeRaw: unknown, meta: { user_agent: string; referer: string }): Promise<string> {
      const code = String(codeRaw ?? '');
      if (code.length < 4 || code.length > 12) return config.appBaseUrl;
      const row = await repo.codeWithReferrer(code.toUpperCase());
      if (!row) return config.appBaseUrl;
      repo.trackEvent('referral_link_clicked', row.code, row.referrer_id, null, { user_agent: meta.user_agent.slice(0, 500), referer: meta.referer.slice(0, 200) });
      return referralUrl(row.code);
    },

    async validate(codeRaw: string) {
      if (!codeRaw || codeRaw.length < 4 || codeRaw.length > 12) throw badRequest('Invalid code format');
      const row = await repo.codeWithReferrer(codeRaw.toUpperCase());
      if (!row) return { valid: false as const, error: 'Code not found' };
      return { valid: true as const, code: row.code, referrer_name: row.referrer_name, reward_preview: 'You and the referrer both earn rewards when you complete a 9+ hole round!' };
    },

    async claim(friendId: number, codeRaw: unknown) {
      const code = String(codeRaw ?? '');
      if (!code) throw badRequest('referral code required');
      const upper = code.toUpperCase();
      const referrerId = await repo.codeOwner(upper);
      if (referrerId == null) return { claimed: false, reason: 'code_not_found' };
      if (referrerId === friendId) return { claimed: false, reason: 'self_referral' };

      const expires_at = windowExpiresAt();
      await repo.upsertActivation(referrerId, friendId, upper, expires_at);
      repo.trackEvent('referral_signup', upper, referrerId, friendId, { activation_status: 'activated' });
      return { claimed: true, expires_at };
    },

    async share(playerId: number, codeRaw: unknown) {
      const code = String(codeRaw ?? '');
      if (!code) throw badRequest('referral code required');
      const upper = code.toUpperCase();
      const owner = await repo.codeOwner(upper);
      if (owner == null || owner !== playerId) throw forbidden('not your code');
      repo.trackEvent('referral_share', upper, playerId, playerId, { share_source: 'referrals_page' });
      return { shared: true };
    },

    async award(friendId: number) {
      const activations = await repo.activatableFor(friendId);
      if (activations.length === 0) return { awarded: false, reason: 'no_active_referral' };

      const rewards: Array<{ referrer_id: number; amount: number }> = [];
      let capped = 0;
      for (const a of activations) {
        // Count per referrer, inside the loop: one friend can carry activations
        // for more than one code, and a cap read once outside would let a
        // referrer past it on the same call.
        const already = await repo.rewardedCount(a.referrer_id);
        const payReferrer = already < MAX_REWARDED_REFERRALS;
        if (payReferrer) {
          await repo.grantGold(a.referrer_id, REWARD_GOLD);
        } else {
          capped++;
        }
        // The friend's joining bonus is NOT capped -- it is once per account by
        // construction, and withholding it would punish the new player for the
        // inviter's history.
        await repo.grantGold(friendId, FRIEND_BONUS_GOLD);
        // Still marked rewarded either way, so the referral is recorded and
        // cannot be re-paid later if the cap is ever raised.
        await repo.markRewarded(a.id, payReferrer ? REWARD_GOLD : 0);
        repo.trackEvent('referral_first_round', a.code_used, a.referrer_id, friendId, { reward_gold: payReferrer ? REWARD_GOLD : 0, friend_bonus: FRIEND_BONUS_GOLD, capped: !payReferrer });
        // These used to write REWARD_GOLD and FRIEND_BONUS_GOLD into xp_log --
        // gold amounts, logged as XP, for XP that was never granted. The award
        // is gold, and grantGold now records it in gold_transactions, so the
        // phantom XP rows are gone rather than moved to the other ledger.
        rewards.push({ referrer_id: a.referrer_id, amount: payReferrer ? REWARD_GOLD : 0 });
      }

      if (rewards.length === 0) return { awarded: false, reason: 'already_rewarded' };
      return { awarded: true, rewards, friend_bonus: FRIEND_BONUS_GOLD, capped };
    },
  };
}

export type ReferralsService = ReturnType<typeof createReferralsService>;
