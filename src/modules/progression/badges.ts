// src/modules/progression/badges.ts — badge catalog + evaluation.
// Data tables generated from the legacy engine; evaluate/logic is typed here.

export const BADGE_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond"
] as const;
export type BadgeTier = (typeof BADGE_TIERS)[number];

export const TIER_COLORS: Record<BadgeTier, { bg: string; border: string; text: string; glow: string }> = {
  "bronze": {
    "bg": "rgba(180,100,40,0.15)",
    "border": "rgba(205,127,50,0.5)",
    "text": "#cd7f32",
    "glow": "rgba(205,127,50,0.3)"
  },
  "silver": {
    "bg": "rgba(160,160,160,0.12)",
    "border": "rgba(192,192,192,0.5)",
    "text": "#c0c0c0",
    "glow": "rgba(192,192,192,0.25)"
  },
  "gold": {
    "bg": "rgba(212,175,55,0.15)",
    "border": "rgba(255,215,0,0.5)",
    "text": "#ffd700",
    "glow": "rgba(255,215,0,0.3)"
  },
  "platinum": {
    "bg": "rgba(100,220,200,0.12)",
    "border": "rgba(100,220,200,0.5)",
    "text": "#7cf5e4",
    "glow": "rgba(100,220,200,0.3)"
  },
  "diamond": {
    "bg": "rgba(120,160,255,0.15)",
    "border": "rgba(150,200,255,0.6)",
    "text": "#a0c8ff",
    "glow": "rgba(150,200,255,0.4)"
  }
};

/** Aggregated player stats a badge threshold can be checked against. */
export interface BadgeStats {
  battleWins: number;
  bestStreak: number;
  challengesCompleted: number;
  completedCities: number;
  completedStates: number;
  maxSameCourseVisits: number;
  morningCheckins: number;
  nightCheckins: number;
  seasonsPlayed: number;
  totalRounds: number;
  trailblazerCourses: number;
  uniqueCourses: number;
  uniqueOpponents: number;
  uniqueStates: number;
  weatherCheckins: number;
  weekendRounds: number;
}

export interface BadgeTierDef {
  threshold: number;
  label: string;
  desc: string;
}

export interface BadgeDefinition {
  name: string;
  icon: string;
  description: string;
  statKey: keyof BadgeStats;
  tiers: Record<BadgeTier, BadgeTierDef>;
}

export const BADGE_DEFINITIONS = {
  "explorer": {
    "name": "Explorer",
    "icon": "🗺️",
    "description": "Courses visited",
    "statKey": "uniqueCourses",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "First Steps",
        "desc": "Visit 1 course"
      },
      "silver": {
        "threshold": 5,
        "label": "Trail Blazer",
        "desc": "Visit 5 courses"
      },
      "gold": {
        "threshold": 10,
        "label": "Course Hunter",
        "desc": "Visit 10 courses"
      },
      "platinum": {
        "threshold": 25,
        "label": "Road Warrior",
        "desc": "Visit 25 courses"
      },
      "diamond": {
        "threshold": 50,
        "label": "Disc Nomad",
        "desc": "Visit 50 courses"
      }
    }
  },
  "course_conqueror": {
    "name": "Course Conqueror",
    "icon": "🏆",
    "description": "Visit 100 courses",
    "statKey": "uniqueCourses",
    "tiers": {
      "bronze": {
        "threshold": 75,
        "label": "Century Chaser",
        "desc": "Visit 75 courses"
      },
      "silver": {
        "threshold": 100,
        "label": "Course Conqueror",
        "desc": "Visit 100 courses"
      },
      "gold": {
        "threshold": 150,
        "label": "Disc Pilgrim",
        "desc": "Visit 150 courses"
      },
      "platinum": {
        "threshold": 250,
        "label": "Course Legend",
        "desc": "Visit 250 courses"
      },
      "diamond": {
        "threshold": 500,
        "label": "Disc Atlas",
        "desc": "Visit 500 courses"
      }
    }
  },
  "state_champion": {
    "name": "State Champion",
    "icon": "🏅",
    "description": "Complete every course in a state",
    "statKey": "completedStates",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "State Champion",
        "desc": "Complete all courses in 1 state"
      },
      "silver": {
        "threshold": 3,
        "label": "Tri-State",
        "desc": "Complete all courses in 3 states"
      },
      "gold": {
        "threshold": 5,
        "label": "Regional Master",
        "desc": "Complete all courses in 5 states"
      },
      "platinum": {
        "threshold": 10,
        "label": "Coast to Coast",
        "desc": "Complete all courses in 10 states"
      },
      "diamond": {
        "threshold": 20,
        "label": "National Legend",
        "desc": "Complete all courses in 20 states"
      }
    }
  },
  "completionist": {
    "name": "Completionist",
    "icon": "✅",
    "description": "Full rounds completed",
    "statKey": "totalRounds",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "First Round",
        "desc": "Complete 1 full round"
      },
      "silver": {
        "threshold": 5,
        "label": "Regular",
        "desc": "Complete 5 full rounds"
      },
      "gold": {
        "threshold": 25,
        "label": "Dedicated",
        "desc": "Complete 25 full rounds"
      },
      "platinum": {
        "threshold": 50,
        "label": "Iron Disc",
        "desc": "Complete 50 full rounds"
      },
      "diamond": {
        "threshold": 100,
        "label": "Round Machine",
        "desc": "Complete 100 full rounds"
      }
    }
  },
  "challenger": {
    "name": "Challenger",
    "icon": "⚔️",
    "description": "Challenges completed",
    "statKey": "challengesCompleted",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "First Challenge",
        "desc": "Complete 1 challenge"
      },
      "silver": {
        "threshold": 5,
        "label": "Task Master",
        "desc": "Complete 5 challenges"
      },
      "gold": {
        "threshold": 15,
        "label": "Quest Hunter",
        "desc": "Complete 15 challenges"
      },
      "platinum": {
        "threshold": 30,
        "label": "Elite Challenger",
        "desc": "Complete 30 challenges"
      },
      "diamond": {
        "threshold": 50,
        "label": "Legend Mode",
        "desc": "Complete 50 challenges"
      }
    }
  },
  "warrior": {
    "name": "Warrior",
    "icon": "🏆",
    "description": "Battle victories",
    "statKey": "battleWins",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "Fighter",
        "desc": "Win 1 battle"
      },
      "silver": {
        "threshold": 10,
        "label": "Competitor",
        "desc": "Win 10 battles"
      },
      "gold": {
        "threshold": 25,
        "label": "Champion",
        "desc": "Win 25 battles"
      },
      "platinum": {
        "threshold": 50,
        "label": "Gladiator",
        "desc": "Win 50 battles"
      },
      "diamond": {
        "threshold": 100,
        "label": "Battle Lord",
        "desc": "Win 100 battles"
      }
    }
  },
  "streak": {
    "name": "Streak",
    "icon": "🔥",
    "description": "Consecutive days playing",
    "statKey": "bestStreak",
    "tiers": {
      "bronze": {
        "threshold": 3,
        "label": "On a Roll",
        "desc": "3-day streak"
      },
      "silver": {
        "threshold": 7,
        "label": "Week Warrior",
        "desc": "7-day streak"
      },
      "gold": {
        "threshold": 14,
        "label": "Fortnight",
        "desc": "14-day streak"
      },
      "platinum": {
        "threshold": 30,
        "label": "Month Strong",
        "desc": "30-day streak"
      },
      "diamond": {
        "threshold": 60,
        "label": "Unbreakable",
        "desc": "60-day streak"
      }
    }
  },
  "social": {
    "name": "Social",
    "icon": "🤝",
    "description": "Unique players battled",
    "statKey": "uniqueOpponents",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "First Rival",
        "desc": "Battle 1 player"
      },
      "silver": {
        "threshold": 5,
        "label": "Social Disc",
        "desc": "Battle 5 players"
      },
      "gold": {
        "threshold": 15,
        "label": "Disc Circle",
        "desc": "Battle 15 players"
      },
      "platinum": {
        "threshold": 30,
        "label": "Known Name",
        "desc": "Battle 30 players"
      },
      "diamond": {
        "threshold": 50,
        "label": "Course Legend",
        "desc": "Battle 50 players"
      }
    }
  },
  "traveler": {
    "name": "Traveler",
    "icon": "✈️",
    "description": "States played in",
    "statKey": "uniqueStates",
    "tiers": {
      "bronze": {
        "threshold": 2,
        "label": "Road Tripper",
        "desc": "Play in 2 states"
      },
      "silver": {
        "threshold": 5,
        "label": "State Hopper",
        "desc": "Play in 5 states"
      },
      "gold": {
        "threshold": 10,
        "label": "Disc Drifter",
        "desc": "Play in 10 states"
      },
      "platinum": {
        "threshold": 20,
        "label": "Coast to Coast",
        "desc": "Play in 20 states"
      },
      "diamond": {
        "threshold": 35,
        "label": "Disc Nomad",
        "desc": "Play in 35 states"
      }
    }
  },
  "local_legend": {
    "name": "Local Legend",
    "icon": "📍",
    "description": "Repeat visits to same course",
    "statKey": "maxSameCourseVisits",
    "tiers": {
      "bronze": {
        "threshold": 5,
        "label": "Regular",
        "desc": "5 visits to one course"
      },
      "silver": {
        "threshold": 10,
        "label": "Home Base",
        "desc": "10 visits to one course"
      },
      "gold": {
        "threshold": 25,
        "label": "Local Fav",
        "desc": "25 visits to one course"
      },
      "platinum": {
        "threshold": 50,
        "label": "Course Keeper",
        "desc": "50 visits to one course"
      },
      "diamond": {
        "threshold": 100,
        "label": "Immortal",
        "desc": "100 visits to one course"
      }
    }
  },
  "weekend_warrior": {
    "name": "Weekend Warrior",
    "icon": "🎉",
    "description": "Weekend rounds played",
    "statKey": "weekendRounds",
    "tiers": {
      "bronze": {
        "threshold": 5,
        "label": "Weekend Starter",
        "desc": "5 weekend rounds"
      },
      "silver": {
        "threshold": 15,
        "label": "TGIF",
        "desc": "15 weekend rounds"
      },
      "gold": {
        "threshold": 30,
        "label": "Weekend Pro",
        "desc": "30 weekend rounds"
      },
      "platinum": {
        "threshold": 50,
        "label": "Perpetual Weekend",
        "desc": "50 weekend rounds"
      },
      "diamond": {
        "threshold": 100,
        "label": "Weekend GOAT",
        "desc": "100 weekend rounds"
      }
    }
  },
  "night_owl": {
    "name": "Night Owl",
    "icon": "🌙",
    "description": "Evening check-ins (8PM–midnight)",
    "statKey": "nightCheckins",
    "tiers": {
      "bronze": {
        "threshold": 3,
        "label": "Night Flyer",
        "desc": "3 night check-ins"
      },
      "silver": {
        "threshold": 10,
        "label": "Moondisc",
        "desc": "10 night check-ins"
      },
      "gold": {
        "threshold": 25,
        "label": "Creature",
        "desc": "25 night check-ins"
      },
      "platinum": {
        "threshold": 50,
        "label": "Nocturnal",
        "desc": "50 night check-ins"
      },
      "diamond": {
        "threshold": 100,
        "label": "Night Legend",
        "desc": "100 night check-ins"
      }
    }
  },
  "early_bird": {
    "name": "Early Bird",
    "icon": "🌅",
    "description": "Morning check-ins (5AM–9AM)",
    "statKey": "morningCheckins",
    "tiers": {
      "bronze": {
        "threshold": 3,
        "label": "Early Riser",
        "desc": "3 morning check-ins"
      },
      "silver": {
        "threshold": 10,
        "label": "Dawn Patrol",
        "desc": "10 morning check-ins"
      },
      "gold": {
        "threshold": 25,
        "label": "Sunrise Disc",
        "desc": "25 morning check-ins"
      },
      "platinum": {
        "threshold": 50,
        "label": "First Light",
        "desc": "50 morning check-ins"
      },
      "diamond": {
        "threshold": 100,
        "label": "Solar Disc",
        "desc": "100 morning check-ins"
      }
    }
  },
  "weatherproof": {
    "name": "Weatherproof",
    "icon": "🌧️",
    "description": "Playing in rain, cold, or heat",
    "statKey": "weatherCheckins",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "Drizzle Disc",
        "desc": "1 weather check-in"
      },
      "silver": {
        "threshold": 5,
        "label": "Storm Chaser",
        "desc": "5 weather check-ins"
      },
      "gold": {
        "threshold": 15,
        "label": "All-Weather",
        "desc": "15 weather check-ins"
      },
      "platinum": {
        "threshold": 30,
        "label": "Elemental",
        "desc": "30 weather check-ins"
      },
      "diamond": {
        "threshold": 50,
        "label": "Forces of Nature",
        "desc": "50 weather check-ins"
      }
    }
  },
  "trailblazer": {
    "name": "Trailblazer",
    "icon": "🚀",
    "description": "First player to check in at a course",
    "statKey": "trailblazerCourses",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "Pioneer",
        "desc": "First at 1 course"
      },
      "silver": {
        "threshold": 3,
        "label": "Pathfinder",
        "desc": "First at 3 courses"
      },
      "gold": {
        "threshold": 10,
        "label": "Frontier Disc",
        "desc": "First at 10 courses"
      },
      "platinum": {
        "threshold": 25,
        "label": "Explorer",
        "desc": "First at 25 courses"
      },
      "diamond": {
        "threshold": 50,
        "label": "Disc Cartographer",
        "desc": "First at 50 courses"
      }
    }
  },
  "seasonal": {
    "name": "Seasonal",
    "icon": "🍂",
    "description": "Play all four seasons",
    "statKey": "seasonsPlayed",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "One Season",
        "desc": "Play in any season"
      },
      "silver": {
        "threshold": 2,
        "label": "Half Year",
        "desc": "Play in 2 seasons"
      },
      "gold": {
        "threshold": 3,
        "label": "Three Seasons",
        "desc": "Play in 3 seasons"
      },
      "platinum": {
        "threshold": 4,
        "label": "Full Calendar",
        "desc": "Play in all 4 seasons"
      },
      "diamond": {
        "threshold": 8,
        "label": "Year-Round Pro",
        "desc": "Play in all 4 seasons, 2 years running"
      }
    }
  },
  "collection": {
    "name": "Collection",
    "icon": "📦",
    "description": "Complete all courses in a city",
    "statKey": "completedCities",
    "tiers": {
      "bronze": {
        "threshold": 1,
        "label": "City Disc",
        "desc": "Complete 1 city"
      },
      "silver": {
        "threshold": 3,
        "label": "Town Tour",
        "desc": "Complete 3 cities"
      },
      "gold": {
        "threshold": 5,
        "label": "Regional Ace",
        "desc": "Complete 5 cities"
      },
      "platinum": {
        "threshold": 10,
        "label": "Metro Master",
        "desc": "Complete 10 cities"
      },
      "diamond": {
        "threshold": 20,
        "label": "Atlas Disc",
        "desc": "Complete 20 cities"
      }
    }
  }
} as const satisfies Record<string, BadgeDefinition>;

export type BadgeCategory = keyof typeof BADGE_DEFINITIONS;

export interface EarnedBadge {
  category: BadgeCategory;
  tier: BadgeTier;
  name: string;
  icon: string;
  label: string;
  desc: string;
}

/**
 * Return every badge the stats now qualify for that isn't already earned.
 * existing is a Set of `${category}:${tier}` keys.
 */
export function evaluateBadges(stats: BadgeStats, existing: Set<string>): EarnedBadge[] {
  const earned: EarnedBadge[] = [];
  for (const category of Object.keys(BADGE_DEFINITIONS) as BadgeCategory[]) {
    const def = BADGE_DEFINITIONS[category];
    const value = stats[def.statKey as keyof BadgeStats] ?? 0;
    for (const tier of BADGE_TIERS) {
      if (existing.has(`${category}:${tier}`)) continue;
      const tierDef = def.tiers[tier];
      if (value >= tierDef.threshold) {
        earned.push({ category, tier, name: def.name, icon: def.icon, label: tierDef.label, desc: tierDef.desc });
      }
    }
  }
  return earned;
}
