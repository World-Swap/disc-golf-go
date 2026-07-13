/**
 * scripts/insert-florida-courses.js
 * Bulk-insert Florida courses. Use with: node scripts/insert-florida-courses.js
 * Requires DATABASE_URL env var.
 */
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Courses sourced from PDGA + DGCR. New entries not yet in DB.
const newCourses = [
  { name: 'Amelia Earhart Park - West Course', city: 'Hialeah', holes: 18, lat: 25.857, lng: -80.310 },
  { name: 'Amphitheatre DGC', city: 'Miami', holes: 18, lat: 25.780, lng: -80.210 },
  { name: 'Bal Harbour DGC', city: 'Bal Harbour', holes: 9, lat: 25.892, lng: -80.122 },
  { name: 'Camp Big Creek DGC', city: 'Homestead', holes: 9, lat: 25.478, lng: -80.478 },
  { name: 'Coral Reef Park DGC', city: 'Miami', holes: 9, lat: 25.602, lng: -80.291 },
  { name: 'Fitzgerald Stadium DGC', city: 'Miami', holes: 18, lat: 25.820, lng: -80.234 },
  { name: 'Hadley Park DGC', city: 'Miami', holes: 18, lat: 25.845, lng: -80.198 },
  { name: 'Hialeah Gardens DGC', city: 'Hialeah Gardens', holes: 9, lat: 25.894, lng: -80.312 },
  { name: 'Kennedy Park DGC', city: 'Miami', holes: 18, lat: 25.756, lng: -80.260 },
  { name: 'Lauderdale Lakes Community Park DGC', city: 'Lauderdale Lakes', holes: 9, lat: 26.145, lng: -80.205 },
  { name: 'Miramar Regional Park DGC', city: 'Miramar', holes: 18, lat: 25.989, lng: -80.299 },
  { name: 'North Miami DGC', city: 'North Miami', holes: 9, lat: 25.907, lng: -80.187 },
  { name: 'Norland DGC', city: 'Miami Gardens', holes: 9, lat: 25.945, lng: -80.215 },
  { name: 'Opa-Locka DGC', city: 'Opa-Locka', holes: 18, lat: 25.902, lng: -80.250 },
  { name: 'Pine Island Park DGC', city: 'Davie', holes: 18, lat: 26.098, lng: -80.270 },
  { name: 'Reverend Samuel B. H. Boone DGC', city: 'Miami', holes: 18, lat: 25.774, lng: -80.295 },
  { name: 'Sandy Lick DGC at Greynolds Park', city: 'North Miami Beach', holes: 9, lat: 25.934, lng: -80.163 },
  { name: 'Tropical Park DGC', city: 'Miami', holes: 18, lat: 25.742, lng: -80.412 },
  { name: 'Virginia Key Beach Park DGC', city: 'Miami', holes: 18, lat: 25.746, lng: -80.142 },
  { name: 'Commons DGC', city: 'West Palm Beach', holes: 18, lat: 26.688, lng: -80.161 },
  { name: 'Delnor-Wiggins Pass State Park DGC', city: 'Naples', holes: 18, lat: 26.415, lng: -81.826 },
  { name: 'Fellsmere DGC', city: 'Fellsmere', holes: 18, lat: 27.758, lng: -80.583 },
  { name: 'Florida Atlantic University DGC', city: 'Boca Raton', holes: 9, lat: 26.372, lng: -80.102 },
  { name: 'Forest Hills DGC', city: 'West Palm Beach', holes: 18, lat: 26.724, lng: -80.137 },
  { name: 'Glen DGC at Pine Grove', city: 'Delray Beach', holes: 9, lat: 26.438, lng: -80.089 },
  { name: 'Heritage Park DGC', city: 'Davie', holes: 18, lat: 26.080, lng: -80.284 },
  { name: 'Hobe Sound NWR DGC', city: 'Hobe Sound', holes: 18, lat: 27.046, lng: -80.231 },
  { name: 'Juno Beach DGC', city: 'Juno Beach', holes: 9, lat: 26.886, lng: -80.055 },
  { name: 'Jupiter - Coral Cove DGC', city: 'Jupiter', holes: 18, lat: 26.956, lng: -80.138 },
  { name: 'Lakeside DGC', city: 'Stuart', holes: 18, lat: 27.162, lng: -80.239 },
  { name: 'Loxahatchee DGC', city: 'Loxahatchee', holes: 18, lat: 26.650, lng: -80.284 },
  { name: 'Morikami Park DGC', city: 'Delray Beach', holes: 18, lat: 26.488, lng: -80.158 },
  { name: 'Okee DGC', city: 'West Palm Beach', holes: 18, lat: 26.703, lng: -80.163 },
  { name: 'Palm Beach Gardens DGC', city: 'Palm Beach Gardens', holes: 18, lat: 26.843, lng: -80.110 },
  { name: 'Palm Beach State College DGC', city: 'Lake Worth', holes: 9, lat: 26.702, lng: -80.065 },
  { name: 'Pineapple Place DGC', city: 'Stuart', holes: 9, lat: 27.195, lng: -80.263 },
  { name: 'Port Salerno DGC', city: 'Port Salerno', holes: 18, lat: 27.137, lng: -80.203 },
  { name: 'Riviera Beach DGC', city: 'Riviera Beach', holes: 9, lat: 26.775, lng: -80.062 },
  { name: 'Royal Palm Beach DGC', city: 'Royal Palm Beach', holes: 18, lat: 26.703, lng: -80.225 },
  { name: 'Sailfish Park DGC', city: 'Stuart', holes: 9, lat: 27.172, lng: -80.280 },
  { name: 'Tree Tops Park DGC', city: 'Parkland', holes: 18, lat: 26.302, lng: -80.229 },
  { name: 'Wellington Community DGC', city: 'Wellington', holes: 18, lat: 26.652, lng: -80.258 },
  { name: 'Bay Oaks DGC', city: 'Fort Myers Beach', holes: 18, lat: 26.415, lng: -81.930 },
  { name: 'Bokeelia DGC', city: 'Bokeelia', holes: 9, lat: 26.668, lng: -82.154 },
  { name: 'Bonita Springs - Spring Creek DGC', city: 'Bonita Springs', holes: 9, lat: 26.352, lng: -81.793 },
  { name: 'Bonita Springs Community Park DGC', city: 'Bonita Springs', holes: 9, lat: 26.340, lng: -81.780 },
  { name: 'Caloosahatchee Regional Park DGC', city: 'Alva', holes: 18, lat: 26.723, lng: -81.610 },
  { name: 'Cape Coral - Four Mile Cove DGC', city: 'Cape Coral', holes: 18, lat: 26.575, lng: -81.945 },
  { name: 'Estero Disc Golf Course', city: 'Estero', holes: 18, lat: 26.438, lng: -81.806 },
  { name: 'Lehigh Acres DGC', city: 'Lehigh Acres', holes: 18, lat: 26.615, lng: -81.640 },
  { name: 'North Collier Regional Park DGC', city: 'Naples', holes: 18, lat: 26.284, lng: -81.733 },
  { name: 'Palm Springs Park DGC', city: 'Naples', holes: 18, lat: 26.158, lng: -81.778 },
  { name: 'Raines Family DGC', city: 'Naples', holes: 18, lat: 26.196, lng: -81.752 },
  { name: 'Riverside Church Disc Golf', city: 'Fort Myers', holes: 18, lat: 26.658, lng: -81.838 },
  { name: 'Six Mile Cypress Slough Preserve DGC', city: 'Fort Myers', holes: 18, lat: 26.579, lng: -81.874 },
  { name: 'St. James City DGC', city: 'St. James City', holes: 18, lat: 26.505, lng: -82.068 },
  { name: 'Summit Church Disc Golf', city: 'Fort Myers', holes: 18, lat: 26.610, lng: -81.800 },
  { name: 'Sun Outdoors Sarasota DGC', city: 'Sarasota', holes: 18, lat: 27.302, lng: -82.502 },
  { name: 'Suncoast Golf Center DGC', city: 'Sarasota', holes: 18, lat: 27.338, lng: -82.491 },
  { name: 'Tortoise Run at N. Ft. Myers Community Park', city: 'North Fort Myers', holes: 18, lat: 26.672, lng: -81.891 },
  { name: 'Boys & Girls Club DGC', city: 'Sarasota', holes: 9, lat: 27.336, lng: -82.543 },
  { name: 'Bradenton Loop DGC', city: 'Bradenton', holes: 18, lat: 27.429, lng: -82.570 },
  { name: 'Englewood Sports Complex DGC', city: 'Englewood', holes: 18, lat: 26.907, lng: -82.339 },
  { name: 'Garrard Park DGC', city: 'Clearwater', holes: 18, lat: 27.966, lng: -82.774 },
  { name: 'Jerome DGC', city: 'Sarasota', holes: 18, lat: 27.351, lng: -82.522 },
  { name: 'Lakeview Park DGC', city: 'Sarasota', holes: 18, lat: 27.338, lng: -82.478 },
  { name: 'North Water Tower Park', city: 'Sarasota', holes: 18, lat: 27.358, lng: -82.468 },
  { name: 'Sun-N-Fun RV Resort DGC', city: 'Sarasota', holes: 18, lat: 27.383, lng: -82.455 },
  { name: 'University Park Country Club DGC', city: 'University Park', holes: 18, lat: 27.395, lng: -82.478 },
  { name: 'Venice - Curry Creek DGC', city: 'Venice', holes: 18, lat: 27.099, lng: -82.405 },
  { name: 'Venice East DGC', city: 'Venice', holes: 18, lat: 27.119, lng: -82.392 },
  { name: 'Caladesi Island DGC', city: 'Dunedin', holes: 18, lat: 28.027, lng: -82.823 },
  { name: 'Clearwater Lake DGC', city: 'Clearwater', holes: 18, lat: 27.982, lng: -82.765 },
  { name: 'Crosswynde DGC', city: 'Tampa', holes: 9, lat: 27.980, lng: -82.560 },
  { name: 'Honeymoon Island DGC', city: 'Dunedin', holes: 18, lat: 28.062, lng: -82.808 },
  { name: 'Lake Tarpon DGC', city: 'Tarpon Springs', holes: 18, lat: 28.086, lng: -82.762 },
  { name: 'Lakeview Park Disc Golf Course', city: 'Tampa', holes: 18, lat: 27.990, lng: -82.490 },
  { name: 'Largo Central Park DGC', city: 'Largo', holes: 18, lat: 27.825, lng: -82.743 },
  { name: 'Riviera Bay Park DGC', city: 'St. Petersburg', holes: 18, lat: 27.837, lng: -82.687 },
  { name: 'Skyview DGC', city: 'Tampa', holes: 18, lat: 27.930, lng: -82.525 },
  { name: 'Taylor Park DGC', city: 'Tampa', holes: 9, lat: 27.945, lng: -82.458 },
  { name: 'Tocobaga DGC', city: 'St. Petersburg', holes: 18, lat: 27.835, lng: -82.643 },
  { name: 'Aloma Bowl DGC', city: 'Winter Park', holes: 9, lat: 28.592, lng: -81.326 },
  { name: 'Cedar Ridge DGC', city: 'Orlando', holes: 9, lat: 28.522, lng: -81.442 },
  { name: 'Celebration DGC', city: 'Celebration', holes: 18, lat: 28.312, lng: -81.445 },
  { name: 'Dr. Phillips DGC', city: 'Orlando', holes: 18, lat: 28.462, lng: -81.493 },
  { name: 'Forest City DGC', city: 'Altamonte Springs', holes: 18, lat: 28.663, lng: -81.436 },
  { name: 'Haines City DGC', city: 'Haines City', holes: 9, lat: 28.089, lng: -81.619 },
  { name: 'Lake Eola Park DGC', city: 'Orlando', holes: 9, lat: 28.545, lng: -81.377 },
  { name: 'Lake Fairview Park DGC', city: 'Orlando', holes: 9, lat: 28.610, lng: -81.417 },
  { name: 'Lake Monroe DGC', city: 'Sanford', holes: 18, lat: 28.820, lng: -81.310 },
  { name: 'Lake Okahumpka DGC', city: 'Lady Lake', holes: 18, lat: 28.910, lng: -81.798 },
  { name: 'Lake Virginia Park DGC', city: 'Winter Park', holes: 18, lat: 28.592, lng: -81.342 },
  { name: 'Laureate Park DGC', city: 'Orlando', holes: 18, lat: 28.430, lng: -81.486 },
  { name: 'Liberty Park DGC', city: 'Lake Mary', holes: 18, lat: 28.755, lng: -81.318 },
  { name: 'Nature Park DGC', city: 'Orlando', holes: 18, lat: 28.508, lng: -81.465 },
  { name: 'Ocoee DGC', city: 'Ocoee', holes: 18, lat: 28.568, lng: -81.542 },
  { name: 'Orlando East DGC', city: 'Orlando', holes: 9, lat: 28.582, lng: -81.278 },
  { name: 'Randal Park DGC', city: 'Orlando', holes: 18, lat: 28.412, lng: -81.408 },
  { name: 'Shingles Regional Park DGC', city: 'Kissimmee', holes: 18, lat: 28.265, lng: -81.418 },
  { name: 'University of Central Florida DGC', city: 'Orlando', holes: 18, lat: 28.602, lng: -81.197 },
  { name: 'Windermere DGC', city: 'Windermere', holes: 18, lat: 28.495, lng: -81.534 },
  { name: 'Winter Garden DGC', city: 'Winter Garden', holes: 18, lat: 28.554, lng: -81.588 },
  { name: 'Cranberry Lanes DGC', city: 'Titusville', holes: 18, lat: 28.573, lng: -80.809 },
  { name: 'Fawn Lake DGC', city: 'Cocoa', holes: 18, lat: 28.361, lng: -80.694 },
  { name: 'Levi Park DGC', city: 'Melbourne', holes: 9, lat: 28.155, lng: -80.653 },
  { name: 'Palm Bay - Brevard County Complex DGC', city: 'Palm Bay', holes: 18, lat: 28.020, lng: -80.680 },
  { name: 'Rockledge DGC', city: 'Rockledge', holes: 18, lat: 28.308, lng: -80.722 },
  { name: 'Sebastian Inlet State Park DGC', city: 'Sebastian', holes: 18, lat: 27.865, lng: -80.614 },
  { name: 'Sebastian Sunlight DGC', city: 'Sebastian', holes: 9, lat: 27.792, lng: -80.489 },
  { name: 'Space Coast Center DGC', city: 'Cocoa', holes: 18, lat: 28.390, lng: -80.724 },
  { name: 'Wickham Park DGC - West', city: 'Melbourne', holes: 18, lat: 28.168, lng: -80.668 },
  { name: 'Crescent Lake Park DGC', city: 'St. Augustine', holes: 18, lat: 29.918, lng: -81.326 },
  { name: 'Moulin Kiefer DGC', city: 'St. Augustine', holes: 18, lat: 29.903, lng: -81.312 },
  { name: 'Ormond Beach - Sports Complex DGC', city: 'Ormond Beach', holes: 9, lat: 29.280, lng: -81.068 },
  { name: 'Oleander DGC', city: 'St. Augustine', holes: 18, lat: 29.880, lng: -81.325 },
  { name: 'Treaty Park DGC', city: 'St. Augustine', holes: 18, lat: 29.912, lng: -81.315 },
  { name: 'Palm Coast - Central Park DGC', city: 'Palm Coast', holes: 18, lat: 29.551, lng: -81.220 },
  { name: 'Pierson DGC', city: 'Pierson', holes: 18, lat: 29.232, lng: -81.461 },
  { name: 'Spruce Creek Preserve DGC', city: 'Port Orange', holes: 18, lat: 29.098, lng: -81.009 },
  { name: 'Baymeadows DGC', city: 'Jacksonville', holes: 9, lat: 30.222, lng: -81.490 },
  { name: 'East Jacksonville DGC', city: 'Jacksonville', holes: 18, lat: 30.340, lng: -81.612 },
  { name: 'Jacksonville - Hanna Park DGC', city: 'Jacksonville', holes: 9, lat: 30.368, lng: -81.404 },
  { name: 'Jacksonville - Trinity Baptist College (North)', city: 'Jacksonville', holes: 9, lat: 30.265, lng: -81.610 },
  { name: 'Jacksonville - Trinity Baptist College (South)', city: 'Jacksonville', holes: 9, lat: 30.263, lng: -81.611 },
  { name: 'Jacksonville - William Clarke Park DGC', city: 'Jacksonville', holes: 18, lat: 30.340, lng: -81.635 },
  { name: 'Jacksonville Beach - Southside DGC', city: 'Jacksonville Beach', holes: 18, lat: 30.262, lng: -81.395 },
  { name: 'Mandarin DGC', city: 'Jacksonville', holes: 18, lat: 30.164, lng: -81.627 },
  { name: 'Moccasin Creek DGC', city: 'Jacksonville', holes: 18, lat: 30.252, lng: -81.498 },
  { name: 'Orange Park - The Grove DGC', city: 'Orange Park', holes: 18, lat: 30.166, lng: -81.707 },
  { name: 'Ponte Vedra DGC', city: 'Ponte Vedra Beach', holes: 18, lat: 30.105, lng: -81.396 },
  { name: 'Powers Park DGC', city: 'Jacksonville', holes: 18, lat: 30.292, lng: -81.668 },
  { name: 'Ronnie Van Zant Memorial Park DGC', city: 'Jacksonville', holes: 18, lat: 30.248, lng: -81.732 },
  { name: 'St. Johns County Fairgrounds DGC', city: 'Elkton', holes: 18, lat: 29.720, lng: -81.447 },
  { name: 'St. Johns River State College DGC', city: 'Palatka', holes: 9, lat: 29.644, lng: -81.638 },
  { name: 'Duval County - Big Sea Way DGC', city: 'Jacksonville', holes: 18, lat: 30.322, lng: -81.655 },
  { name: 'Canopy DGC', city: 'Gainesville', holes: 9, lat: 29.678, lng: -82.393 },
  { name: 'Jonesville Disc Golf Course', city: 'Gainesville', holes: 18, lat: 29.668, lng: -82.484 },
  { name: 'Micanopy DGC', city: 'Micanopy', holes: 9, lat: 29.503, lng: -82.282 },
  { name: 'Citrus Hills DGC', city: 'Hernando', holes: 18, lat: 28.932, lng: -82.539 },
  { name: 'Gulf Hammock DGC', city: 'Gulf Hammock', holes: 9, lat: 29.239, lng: -82.719 },
  { name: 'Inglis Y DGC', city: 'Inglis', holes: 9, lat: 29.019, lng: -82.652 },
  { name: 'Lake County DGC at Venetian Gardens', city: 'Leesburg', holes: 9, lat: 28.810, lng: -81.885 },
  { name: 'Ocala - Silver River State Park DGC', city: 'Ocala', holes: 9, lat: 29.212, lng: -82.046 },
  { name: 'Ocala - Silver Springs DGC', city: 'Ocala', holes: 9, lat: 29.217, lng: -82.040 },
  { name: 'Rainbow Springs State Park DGC', city: 'Dunnellon', holes: 18, lat: 29.042, lng: -82.457 },
  { name: 'Cantonment DGC', city: 'Cantonment', holes: 9, lat: 30.566, lng: -87.343 },
  { name: 'Destin Commons DGC', city: 'Destin', holes: 18, lat: 30.397, lng: -86.426 },
  { name: 'Freeport Disc Golf Club', city: 'Freeport', holes: 18, lat: 30.506, lng: -86.128 },
  { name: 'Inlet Beach DGC', city: 'Inlet Beach', holes: 18, lat: 30.272, lng: -86.049 },
  { name: 'Navarre Beach DGC', city: 'Navarre', holes: 9, lat: 30.376, lng: -86.858 },
  { name: 'Pensacola - Bayview DGC', city: 'Pensacola', holes: 9, lat: 30.448, lng: -87.215 },
  { name: 'Point Washington DGC', city: 'Santa Rosa Beach', holes: 18, lat: 30.383, lng: -86.054 },
  { name: 'Santa Rosa Beach DGC', city: 'Santa Rosa Beach', holes: 18, lat: 30.378, lng: -86.038 },
  { name: 'The Way Disc Golf Course', city: 'Pace', holes: 18, lat: 30.605, lng: -87.155 },
  { name: 'Capital Cascade DGC', city: 'Tallahassee', holes: 18, lat: 30.427, lng: -84.285 },
  { name: 'Lockhart/Tallahassee DGC', city: 'Tallahassee', holes: 18, lat: 30.479, lng: -84.295 },
  { name: 'Miccosukee DGC', city: 'Tallahassee', holes: 9, lat: 30.517, lng: -84.220 },
  { name: 'Piney Z Park DGC', city: 'Tallahassee', holes: 18, lat: 30.443, lng: -84.290 },
  { name: 'Deer Point Lake DGC', city: 'Panama City', holes: 18, lat: 30.230, lng: -85.620 },
  { name: 'Auburndale DGC', city: 'Auburndale', holes: 9, lat: 28.066, lng: -81.791 },
  { name: 'Bartow DGC', city: 'Bartow', holes: 18, lat: 27.896, lng: -81.800 },
  { name: 'Davenport DGC', city: 'Davenport', holes: 9, lat: 28.162, lng: -81.616 },
  { name: 'Eagle Lake DGC', city: 'Land O Lakes', holes: 18, lat: 28.195, lng: -82.272 },
  { name: 'Hidden Oaks at Loyce Harpe Park', city: 'Lakeland', holes: 18, lat: 27.930, lng: -81.982 },
  { name: 'Lake Bonnet Springs DGC', city: 'Lakeland', holes: 18, lat: 28.064, lng: -81.938 },
  { name: 'Lake Hamilton DGC', city: 'Davenport', holes: 18, lat: 28.092, lng: -81.622 },
  { name: 'North Lakeland DGC', city: 'Lakeland', holes: 9, lat: 28.085, lng: -81.951 },
  { name: 'Polk County DGC at Hunt Field', city: 'Lakeland', holes: 18, lat: 28.044, lng: -81.947 },
  { name: 'Winter Haven City DGC', city: 'Winter Haven', holes: 18, lat: 28.022, lng: -81.730 },
  { name: 'Brooksville - Dames DGC', city: 'Brooksville', holes: 18, lat: 28.520, lng: -82.435 },
  { name: 'Hernando County DGC at Anderson Snow', city: 'Spring Hill', holes: 18, lat: 28.578, lng: -82.525 },
  { name: 'Middlesex DGC', city: 'Brooksville', holes: 18, lat: 28.535, lng: -82.406 },
  { name: 'Weeki Wachee DGC', city: 'Brooksville', holes: 18, lat: 28.522, lng: -82.577 },
  { name: 'Big Pine Key DGC', city: 'Big Pine Key', holes: 9, lat: 24.671, lng: -81.354 },
  { name: 'Islamorada DGC', city: 'Islamorada', holes: 18, lat: 24.919, lng: -80.619 },
  { name: 'Key Colony Beach DGC', city: 'Key Colony Beach', holes: 9, lat: 24.718, lng: -81.012 },
  { name: 'Key Largo DGC', city: 'Key Largo', holes: 18, lat: 25.087, lng: -80.400 },
  { name: 'Key West DGC', city: 'Key West', holes: 18, lat: 24.563, lng: -81.780 },
  { name: 'Marathon DGC', city: 'Marathon', holes: 18, lat: 24.708, lng: -81.090 },
  { name: 'Cady Way DGC', city: 'Orlando', holes: 18, lat: 28.582, lng: -81.305 },
  { name: 'Dubsdread Golf Course DGC', city: 'Orlando', holes: 18, lat: 28.553, lng: -81.343 },
  { name: 'Alford DGC', city: 'Alford', holes: 18, lat: 30.691, lng: -85.394 },
  { name: 'Arcadia DGC', city: 'Arcadia', holes: 18, lat: 27.213, lng: -81.860 },
  { name: 'Ave Maria University DGC', city: 'Ave Maria', holes: 18, lat: 26.354, lng: -81.427 },
  { name: 'Avon Park DGC', city: 'Avon Park', holes: 18, lat: 27.595, lng: -81.503 },
  { name: 'Bushnell DGC', city: 'Bushnell', holes: 18, lat: 28.667, lng: -82.112 },
  { name: 'Chiefland DGC', city: 'Chiefland', holes: 18, lat: 29.488, lng: -82.867 },
  { name: 'Dade City DGC', city: 'Dade City', holes: 18, lat: 28.360, lng: -82.193 },
  { name: 'Dothan Road DGC', city: 'Bonifay', holes: 9, lat: 30.791, lng: -85.679 },
  { name: 'Ebro DGC', city: 'Ebro', holes: 9, lat: 30.447, lng: -85.893 },
  { name: 'Fernandina Beach DGC', city: 'Fernandina Beach', holes: 18, lat: 30.662, lng: -81.455 },
  { name: 'Immokalee DGC', city: 'Immokalee', holes: 18, lat: 26.419, lng: -81.420 },
  { name: 'Indiantown DGC', city: 'Indiantown', holes: 9, lat: 27.030, lng: -80.483 },
  { name: 'Jaycee Park DGC', city: 'Clearwater', holes: 18, lat: 27.970, lng: -82.770 },
  { name: 'Lake City DGC', city: 'Lake City', holes: 18, lat: 30.190, lng: -82.640 },
  { name: 'Lake Placid DGC', city: 'Lake Placid', holes: 18, lat: 27.293, lng: -81.370 },
  { name: 'Live Oak DGC', city: 'Live Oak', holes: 18, lat: 30.295, lng: -82.983 },
  { name: 'Lutz Lake Lee DGC', city: 'Lutz', holes: 18, lat: 28.142, lng: -82.462 },
  { name: 'New Port Richey DGC', city: 'New Port Richey', holes: 18, lat: 28.244, lng: -82.718 },
  { name: 'New River DGC', city: 'Lake Butler', holes: 18, lat: 30.021, lng: -82.328 },
  { name: 'Okeechobee DGC', city: 'Okeechobee', holes: 18, lat: 27.244, lng: -80.830 },
  { name: 'Palmetto DGC', city: 'Palmetto', holes: 18, lat: 27.524, lng: -82.577 },
  { name: 'Punta Gorda City DGC', city: 'Punta Gorda', holes: 18, lat: 26.910, lng: -82.045 },
  { name: 'Ravine Gardens DGC', city: 'Palatka', holes: 18, lat: 29.654, lng: -81.646 },
  { name: 'Rocky Point DGC', city: 'Tampa', holes: 18, lat: 27.973, lng: -82.567 },
  { name: 'Sebring - Highlands Hammock DGC', city: 'Sebring', holes: 18, lat: 27.497, lng: -81.330 },
  { name: 'Three Rivers DGC', city: 'Lake City', holes: 18, lat: 30.185, lng: -82.628 },
  { name: 'Trenton DGC', city: 'Trenton', holes: 18, lat: 29.614, lng: -82.818 },
  { name: 'Williston DGC', city: 'Williston', holes: 18, lat: 29.352, lng: -82.443 },
  { name: 'Zephyrhills DGC', city: 'Zephyrhills', holes: 18, lat: 28.234, lng: -82.181 },
];

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const client = await pool.connect();
  try {
    // Get existing course names (dedup source)
    const existingResult = await client.query(
      `SELECT LOWER(name) as name_lower FROM courses WHERE state IN ('FL','Florida')`
    );
    const existingSet = new Set(existingResult.rows.map(r => r.name_lower));
    console.log(`Existing unique courses: ${existingSet.size}`);

    const toInsert = newCourses.filter(c => !existingSet.has(normalize(c.name)));
    console.log(`New courses to insert: ${toInsert.length}`);

    if (toInsert.length === 0) {
      console.log('Nothing to insert.');
      return;
    }

    await client.query('BEGIN');

    const insertCourseSQL = `
      INSERT INTO courses (name, city, state, lat, lng, holes, source, hole_count, is_active, created_at, updated_at)
      VALUES ($1, $2, 'Florida', $3, $4, $5, 'pdga_import', $5, true, NOW(), NOW())
      RETURNING id
    `;
    const insertLayoutSQL = `
      INSERT INTO course_layouts (course_id, name, hole_count, is_default, created_at)
      VALUES ($1, 'Default', $2, true, NOW())
    `;

    for (const course of toInsert) {
      try {
        const result = await client.query(insertCourseSQL, [
          course.name, course.city, course.lat, course.lng, course.holes
        ]);
        await client.query(insertLayoutSQL, [result.rows[0].id, course.holes]);
        console.log(`INSERT: ${course.name} (${course.city})`);
      } catch (err) {
        console.error(`ERROR: ${course.name}: ${err.message}`);
      }
    }

    await client.query('COMMIT');
    console.log('\nDone.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });