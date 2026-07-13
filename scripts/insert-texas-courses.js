/**
 * scripts/insert-texas-courses.js
 * Bulk-insert Texas courses from PDGA directory.
 * Use: node scripts/insert-texas-courses.js
 * Requires DATABASE_URL env var.
 */
'use strict';

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// All courses sourced from PDGA course directory (pages 0-10, 549 total).
// Missing from DB = not in current 169 courses (normalized match).
// lat/lng = city approximate center (PDGA doesn't always expose GPS on directory pages).
// Priority 9+ holes. Multi-layout courses listed once with primary hole count.
const newCourses = [
  // === HOUSTON AREA (27 existing, many missing) ===
  { name: 'Brock Park DGC', city: 'Houston', holes: 18, lat: 29.801, lng: -95.376 },
  { name: 'Duessen Park DGC', city: 'Houston', holes: 18, lat: 29.817, lng: -95.262 },
  { name: 'Challenger 7 Memorial DGC', city: 'Webster', holes: 18, lat: 29.533, lng: -95.118 },
  { name: 'Challenger Park DGC', city: 'Arcola', holes: 9, lat: 29.502, lng: -95.439 },
  { name: 'Indian Shores DGC', city: 'Crosby', holes: 18, lat: 29.915, lng: -95.065 },
  { name: 'Hog Heaven DGC', city: 'Point Blank', holes: 18, lat: 30.653, lng: -95.213 },
  { name: 'Eric Paddy Memorial DGC', city: 'Tomball', holes: 18, lat: 30.097, lng: -95.617 },
  { name: 'Jack Brooks Park - Cedar Hills', city: 'Hitchcock', holes: 18, lat: 29.624, lng: -95.020 },
  { name: 'Jack Brooks Park - Gulf Meadows', city: 'Hitchcock', holes: 18, lat: 29.624, lng: -95.020 },
  { name: 'Cornerstone Church DGC', city: 'Lake Jackson', holes: 18, lat: 29.033, lng: -95.431 },
  { name: 'Briscoe Park DGC', city: 'Alvin', holes: 18, lat: 29.423, lng: -95.244 },
  { name: 'Kiosk DGC', city: 'Houston', holes: 18, lat: 29.760, lng: -95.369 },
  { name: 'Rockette DGC', city: 'Houston', holes: 18, lat: 29.760, lng: -95.369 },
  { name: 'Squeeze DGC', city: 'Houston', holes: 18, lat: 29.760, lng: -95.369 },
  { name: 'Sully Creek DGC', city: 'Houston', holes: 18, lat: 29.760, lng: -95.369 },
  { name: 'W.G. Mills DGC', city: 'Houston', holes: 18, lat: 29.760, lng: -95.369 },
  { name: 'Bear Creek Pioneers Park DGC', city: 'Houston', holes: 18, lat: 29.813, lng: -95.702 },
  { name: 'Herman Brown Park DGC', city: 'Houston', holes: 18, lat: 29.773, lng: -95.411 },
  { name: 'MacAllister Park DGC', city: 'Houston', holes: 18, lat: 29.816, lng: -95.420 },
  { name: 'Mercer Arboretum DGC', city: 'Houston', holes: 18, lat: 30.055, lng: -95.455 },
  { name: 'Lake Houston DGC', city: 'Houston', holes: 18, lat: 29.955, lng: -95.147 },
  { name: 'Kleb Woods DGC', city: 'Houston', holes: 18, lat: 30.022, lng: -95.614 },
  { name: 'Jesse H. Jones Park DGC', city: 'Humble', holes: 18, lat: 30.054, lng: -95.261 },
  { name: 'Millsap DGC', city: 'Kingwood', holes: 18, lat: 30.045, lng: -95.018 },
  { name: 'Burke Crenshaw Park', city: 'Pasadena', holes: 10, lat: 29.691, lng: -95.148 },
  { name: 'First Colony Aquatic Center DGC', city: 'Sugar Land', holes: 10, lat: 29.597, lng: -95.635 },
  { name: 'Imperial Park DGC', city: 'Sugar Land', holes: 10, lat: 29.585, lng: -95.620 },
  { name: 'Brazos River Park DGC', city: 'Sugar Land', holes: 9, lat: 29.588, lng: -95.668 },
  { name: 'MacGregor Park DGC', city: 'Houston', holes: 21, lat: 29.717, lng: -95.401 },
  { name: 'Mason Park DGC', city: 'Houston', holes: 9, lat: 29.693, lng: -95.368 },
  { name: 'Husky Disc Golf at Houston Baptist University', city: 'Houston', holes: 9, lat: 29.719, lng: -95.442 },
  { name: 'Jersey Village DGC', city: 'Jersey Village', holes: 8, lat: 29.919, lng: -95.542 },
  { name: 'Little Egypt DGC at John Burne Park', city: 'Conroe', holes: 18, lat: 30.311, lng: -95.456 },
  { name: 'Gwen Hruska Memorial Park DGC', city: 'Conroe', holes: 9, lat: 30.317, lng: -95.476 },
  { name: 'Lone Star Disc DGC', city: 'Conroe', holes: 18, lat: 30.317, lng: -95.476 },
  { name: 'Jones Creek Ranch Park DGC', city: 'Richmond', holes: 18, lat: 29.583, lng: -95.762 },
  { name: 'MacNaughton MultiGolfPark', city: 'Missouri City', holes: 9, lat: 29.580, lng: -95.535 },

  // === AUSTIN AREA (23 existing, many missing) ===
  { name: 'Briarcliff DGC', city: 'Briarcliff', holes: 9, lat: 30.298, lng: -97.893 },
  { name: 'Harvey Penick DGC', city: 'Austin', holes: 18, lat: 30.237, lng: -97.748 },
  { name: 'Davis Spring DGC', city: 'Austin', holes: 9, lat: 30.464, lng: -97.764 },
  { name: 'Hill Country Bible Church DGC', city: 'Austin', holes: 9, lat: 30.412, lng: -97.757 },
  { name: 'Griffis Southpark DGC', city: 'Austin', holes: 9, lat: 30.221, lng: -97.756 },
  { name: 'Clint Small Middle School DGC', city: 'Austin', holes: 8, lat: 30.156, lng: -97.835 },
  { name: 'Fedd Fairways at Life Austin Church DGC', city: 'Austin', holes: 9, lat: 30.251, lng: -97.783 },
  { name: 'Beerburg Brewery DGC', city: 'Austin', holes: 9, lat: 30.236, lng: -97.835 },
  { name: 'Brentwood DGC', city: 'Austin', holes: 9, lat: 30.326, lng: -97.727 },
  { name: 'Austin Ridge Bible Church DGC', city: 'Austin', holes: 20, lat: 30.286, lng: -97.901 },
  { name: 'Circle C Ranch on Slaughter Creek DGC', city: 'Austin', holes: 18, lat: 30.174, lng: -97.880 },
  { name: 'Bartholomew Park DGC (15-hole layout)', city: 'Austin', holes: 15, lat: 30.302, lng: -97.692 },
  { name: 'Flat Creek Estate DGC', city: 'Marble Falls', holes: 18, lat: 30.574, lng: -98.277 },
  { name: 'Iron Wolf DGC', city: 'Spicewood', holes: 9, lat: 30.443, lng: -98.135 },
  { name: 'Galloway Hammond Rec Center DGC', city: 'Burnet', holes: 18, lat: 30.756, lng: -98.385 },
  { name: 'Haley Nelson DGC', city: 'Burnet', holes: 9, lat: 30.756, lng: -98.385 },
  { name: 'Hill Country Fellowship DGC', city: 'Burnet', holes: 18, lat: 30.756, lng: -98.385 },
  { name: 'Bull Branch DGC', city: 'Taylor', holes: 9, lat: 30.570, lng: -97.408 },
  { name: 'Chapel Hill DGC', city: 'Georgetown', holes: 18, lat: 30.633, lng: -97.686 },
  { name: 'Falcon Pointe DGC', city: 'Pflugerville', holes: 16, lat: 30.437, lng: -97.659 },
  { name: 'Springs DGC', city: 'Pflugerville', holes: 18, lat: 30.437, lng: -97.659 },
  { name: 'East Metro Park DGC', city: 'Manor', holes: 18, lat: 30.343, lng: -97.512 },
  { name: 'Brushy Creek Sports Park DGC', city: 'Cedar Park', holes: 9, lat: 30.505, lng: -97.826 },
  { name: 'Cedar Park Middle School DGC', city: 'Cedar Park', holes: 9, lat: 30.498, lng: -97.812 },
  { name: 'Sunset Glen DGC', city: 'Cedar Park', holes: 18, lat: 30.505, lng: -97.820 },
  { name: 'Cat Hollow DGC', city: 'Round Rock', holes: 18, lat: 30.520, lng: -97.657 },
  { name: 'Cedar Valley Middle School DGC', city: 'Round Rock', holes: 9, lat: 30.524, lng: -97.679 },
  { name: 'Heritage Park DGC', city: 'Flower Mound', holes: 18, lat: 33.014, lng: -97.078 },
  { name: 'Lake Travis DGC', city: 'Lakeway', holes: 18, lat: 30.358, lng: -97.997 },
  { name: 'Southwest Williamson County Regional Park DGC', city: 'Leander', holes: 18, lat: 30.510, lng: -97.859 },
  { name: 'Benbrook Ranch Park DGC', city: 'Leander', holes: 18, lat: 30.492, lng: -97.855 },
  { name: 'J M Lindsay Park DGC', city: 'Lindsay', holes: 9, lat: 33.639, lng: -97.258 },
  { name: 'Harvey Penick DGC at Austin', city: 'Austin', holes: 18, lat: 30.237, lng: -97.748 },

  // === SAN ANTONIO AREA (17 existing, some missing) ===
  { name: 'Bryan McClain Park DGC', city: 'San Antonio', holes: 18, lat: 29.517, lng: -98.533 },
  { name: 'Graytown Park DGC', city: 'Elmendorf', holes: 18, lat: 29.285, lng: -98.411 },
  { name: 'Incarnate Word DGC', city: 'San Antonio', holes: 9, lat: 29.462, lng: -98.486 },
  { name: 'Communion Park DGC', city: 'Universal City', holes: 9, lat: 29.548, lng: -98.289 },
  { name: 'Calvary Baptist DGC', city: 'New Braunfels', holes: 9, lat: 29.699, lng: -98.118 },
  { name: 'Helotes Natural Area DGC', city: 'Helotes', holes: 9, lat: 29.578, lng: -98.691 },
  { name: 'Cibolo Creek Elementary DGC', city: 'Boerne', holes: 10, lat: 29.764, lng: -98.732 },
  { name: 'Boerne City Lake Park DGC', city: 'Boerne', holes: 9, lat: 29.749, lng: -98.714 },
  { name: 'Horseshoe Bend DGC', city: 'Bandera', holes: 18, lat: 29.724, lng: -99.071 },
  { name: 'Holy Rocks DGC', city: 'Spring Branch', holes: 18, lat: 29.863, lng: -98.476 },
  { name: 'Joshua Springs Park & Preserve DGC', city: 'Comfort', holes: 18, lat: 29.969, lng: -98.918 },
  { name: 'Max Starcke DGC', city: 'Seguin', holes: 18, lat: 29.571, lng: -97.948 },
  { name: 'Foxs Bend at Riverside Park DGC', city: 'Victoria', holes: 18, lat: 28.805, lng: -97.003 },
  { name: 'Coleto Creek DGC', city: 'Victoria', holes: 18, lat: 28.753, lng: -96.964 },
  { name: 'Ethel Lee Tracy Park DGC', city: 'Victoria', holes: 9, lat: 28.787, lng: -96.967 },
  { name: 'Espiritu Santo DGC', city: 'Goliad', holes: 18, lat: 28.711, lng: -97.381 },
  { name: 'Branch Nature Park DGC', city: 'Goliad', holes: 9, lat: 28.711, lng: -97.381 },
  { name: 'Dick Kleberg Park DGC', city: 'Kingsville', holes: 9, lat: 27.515, lng: -97.861 },
  { name: 'Brackenridge Plantation DGC', city: 'Edna', holes: 18, lat: 28.977, lng: -96.646 },
  { name: 'Brazos Park DGC', city: 'Rosenberg', holes: 9, lat: 29.557, lng: -95.809 },
  { name: 'Gonzales DGC', city: 'Gonzales', holes: 18, lat: 29.504, lng: -97.390 },
  { name: 'Buena Vista Park DGC', city: 'Del Rio', holes: 9, lat: 29.369, lng: -100.891 },
  { name: 'Fort Clark DGC', city: 'Brackettville', holes: 9, lat: 29.311, lng: -100.414 },
  { name: 'Eagle 11 DGC', city: 'Rocksprings', holes: 11, lat: 30.015, lng: -100.040 },

  // === DALLAS / FORT WORTH AREA ===
  { name: 'Lester Lorch Park - Beaver DGC', city: 'Cedar Hill', holes: 18, lat: 32.557, lng: -96.992 },
  { name: 'Lester Lorch Park - Coyote DGC', city: 'Cedar Hill', holes: 18, lat: 32.557, lng: -96.992 },
  { name: 'B. B. Owen Park DGC', city: 'Dallas', holes: 18, lat: 32.951, lng: -96.722 },
  { name: 'Founders Park DGC', city: 'Dallas', holes: 11, lat: 32.748, lng: -96.818 },
  { name: 'Jimmy Porter Park DGC', city: 'Carrollton', holes: 18, lat: 32.954, lng: -96.898 },
  { name: 'Castle Hills DGC', city: 'Carrollton', holes: 18, lat: 32.953, lng: -96.895 },
  { name: 'Lawnview Park DGC', city: 'Dallas', holes: 9, lat: 32.864, lng: -96.723 },
  { name: 'Crossroads of Life DGC', city: 'Duncanville', holes: 18, lat: 32.647, lng: -96.909 },
  { name: 'Cedar Valley DGC', city: 'Lancaster', holes: 18, lat: 32.592, lng: -96.753 },
  { name: 'Cherry Creek DGC', city: 'Red Oak', holes: 9, lat: 32.535, lng: -96.799 },
  { name: 'Arcadia Park #2 DGC', city: 'Fort Worth', holes: 18, lat: 32.812, lng: -97.211 },
  { name: 'Greenbriar Community Center DGC', city: 'Fort Worth', holes: 18, lat: 32.715, lng: -97.309 },
  { name: 'Gateway West (The Privy) DGC', city: 'Fort Worth', holes: 18, lat: 32.769, lng: -97.262 },
  { name: 'City Disc Park DGC', city: 'Fort Worth', holes: 9, lat: 32.765, lng: -97.308 },
  { name: 'Eagle Ranch DGC', city: 'Fort Worth', holes: 9, lat: 32.958, lng: -97.417 },
  { name: 'Granbury City Park DGC', city: 'Granbury', holes: 21, lat: 32.443, lng: -97.776 },
  { name: 'Lakeside Baptist DGC', city: 'Granbury', holes: 9, lat: 32.443, lng: -97.776 },
  { name: 'Eagle Summit DGC', city: 'Decatur', holes: 18, lat: 33.234, lng: -97.582 },
  { name: 'Haslet Community Park DGC', city: 'Haslet', holes: 18, lat: 32.959, lng: -97.339 },
  { name: 'Dewey Disc Golf Course', city: 'Pampa', holes: 18, lat: 35.535, lng: -100.603 },
  { name: 'Gordon Lake DGC', city: 'Iowa Park', holes: 16, lat: 33.958, lng: -98.670 },
  { name: 'Camp Chaparral DGC', city: 'Iowa Park', holes: 9, lat: 33.958, lng: -98.670 },
  { name: 'Eagles Nest DGC', city: 'Holliday', holes: 9, lat: 33.836, lng: -98.688 },
  { name: 'Duncanville DGC', city: 'Duncanville', holes: 18, lat: 32.647, lng: -96.909 },
  { name: 'Ennis DGC at Lake Clark Park', city: 'Ennis', holes: 18, lat: 32.324, lng: -96.636 },
  { name: 'Baylor DGC', city: 'Waco', holes: 18, lat: 31.551, lng: -97.120 },
  { name: 'George W. Truett DGC', city: 'Waco', holes: 18, lat: 31.551, lng: -97.120 },
  { name: 'Dewey Park DGC', city: 'Waco', holes: 9, lat: 31.534, lng: -97.132 },
  { name: 'Brazos Park East DGC', city: 'Waco', holes: 18, lat: 31.535, lng: -97.068 },
  { name: 'Lion Park DGC', city: 'Temple', holes: 21, lat: 31.098, lng: -97.343 },
  { name: 'Crossroads DGC', city: 'Temple', holes: 27, lat: 31.107, lng: -97.342 },
  { name: 'Cuesta DGC at Hill College', city: 'Hillsboro', holes: 18, lat: 32.010, lng: -97.127 },
  { name: 'Hillsboro City Park DGC', city: 'Hillsboro', holes: 9, lat: 32.010, lng: -97.127 },
  { name: 'Fullerton-Garrity DGC', city: 'Corsicana', holes: 9, lat: 32.067, lng: -96.468 },
  { name: 'Amigo Park at Hill College DGC', city: 'Cleburne', holes: 18, lat: 32.348, lng: -97.379 },
  { name: 'Buffalo DGC', city: 'Cleburne', holes: 18, lat: 32.348, lng: -97.379 },
  { name: 'Carver Park DGC', city: 'Keene', holes: 9, lat: 32.396, lng: -97.332 },
  { name: 'Brown-Singleton Park DGC', city: 'Waxahachie', holes: 18, lat: 32.543, lng: -96.848 },
  { name: 'Waxahachie DGC', city: 'Waxahachie', holes: 18, lat: 32.543, lng: -96.848 },
  { name: 'Water Tower DGC', city: 'Weatherford', holes: 18, lat: 32.759, lng: -97.797 },
  { name: 'Saddle Hills DGC', city: 'White Settlement', holes: 18, lat: 32.759, lng: -97.361 },
  { name: 'Sikes DGC', city: 'Wichita Falls', holes: 18, lat: 33.910, lng: -98.493 },
  { name: 'Kemp DGC', city: 'Wichita Falls', holes: 18, lat: 33.910, lng: -98.493 },
  { name: 'Lake Arrowhead State Park DGC', city: 'Wichita Falls', holes: 18, lat: 33.828, lng: -98.477 },
  { name: 'Lucy Park DGC', city: 'Wichita Falls', holes: 18, lat: 33.897, lng: -98.490 },
  { name: 'Lake Wichita Park DGC', city: 'Wichita Falls', holes: 18, lat: 33.887, lng: -98.501 },

  // === TYLER / EAST TX ===
  { name: 'Bristow DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Lindsey Park - Red Cedar DGC', city: 'Tyler', holes: 18, lat: 32.310, lng: -95.230 },
  { name: 'Lindsey Park - Gold Dogwood DGC', city: 'Tyler', holes: 18, lat: 32.310, lng: -95.230 },
  { name: 'Lindsey Park - Blue Hickory DGC', city: 'Tyler', holes: 18, lat: 32.310, lng: -95.230 },
  { name: 'Lazy W CD DGC', city: 'Athens', holes: 18, lat: 32.202, lng: -95.856 },
  { name: 'Davy Crockett DGC', city: 'Crockett', holes: 18, lat: 31.319, lng: -95.456 },
  { name: 'Guthrie Park DGC', city: 'Longview', holes: 18, lat: 32.500, lng: -94.737 },
  { name: 'Hinsley Park DGC', city: 'Longview', holes: 18, lat: 32.492, lng: -94.739 },
  { name: 'Ingram Park DGC', city: 'Longview', holes: 9, lat: 32.492, lng: -94.739 },
  { name: 'Lear Park DGC', city: 'Longview', holes: 18, lat: 32.508, lng: -94.750 },
  { name: 'LeTourneau University DGC', city: 'Longview', holes: 9, lat: 32.489, lng: -94.724 },
  { name: 'Lakeside Park DGC', city: 'Jefferson', holes: 18, lat: 32.766, lng: -94.356 },
  { name: 'Lake Forest Park DGC', city: 'Henderson', holes: 9, lat: 32.153, lng: -94.799 },
  { name: 'Lake Striker Resort DGC', city: 'Henderson', holes: 16, lat: 32.017, lng: -94.800 },
  { name: 'Iron Spike at Greens Park DGC', city: 'Palestine', holes: 9, lat: 31.746, lng: -95.630 },
  { name: 'Darden Harvest Park DGC', city: 'Lindale', holes: 18, lat: 32.285, lng: -95.405 },
  { name: 'Linden DGC', city: 'Linden', holes: 18, lat: 33.010, lng: -94.372 },
  { name: 'Lumberton DGC', city: 'Lumberton', holes: 18, lat: 30.261, lng: -94.181 },
  { name: 'Klein Park DGC', city: 'Beaumont', holes: 18, lat: 30.085, lng: -94.134 },
  { name: 'Copperhead DGC', city: 'Vidor', holes: 18, lat: 30.030, lng: -93.998 },
  { name: 'Beavers Hole DGC', city: 'Vidor', holes: 18, lat: 30.030, lng: -93.998 },
  { name: 'Hemphill DGC', city: 'Hemphill', holes: 9, lat: 31.372, lng: -93.855 },
  { name: 'Hohlt Park DGC', city: 'Brenham', holes: 9, lat: 30.170, lng: -96.396 },
  { name: 'Cherry Creek Park DGC', city: 'Canton', holes: 18, lat: 32.555, lng: -95.875 },
  { name: 'Crossroads DGC', city: 'Canton', holes: 18, lat: 32.555, lng: -95.875 },
  { name: 'Gun Barrel City DGC', city: 'Gun Barrel', holes: 18, lat: 32.280, lng: -95.872 },
  { name: 'Graham Park DGC', city: 'Greenville', holes: 9, lat: 33.137, lng: -96.110 },
  { name: 'DL Jackson DGC', city: 'Collinsville', holes: 18, lat: 33.564, lng: -96.905 },
  { name: 'Jack Culverhouse DGC', city: 'Princeton', holes: 18, lat: 33.177, lng: -96.499 },
  { name: 'Cleburne DGC', city: 'Cleburne', holes: 18, lat: 32.348, lng: -97.379 },
  { name: 'Fallen Hero Memorial DGC', city: 'Hico', holes: 18, lat: 31.981, lng: -98.828 },
  { name: 'Fayette County Fairgrounds DGC', city: 'La Grange', holes: 9, lat: 29.906, lng: -96.876 },
  { name: 'Florence DGC', city: 'Florence', holes: 18, lat: 30.843, lng: -97.792 },
  { name: 'Heritage Park DGC', city: 'Belton', holes: 36, lat: 31.059, lng: -97.463 },
  { name: 'Groesbeck DGC', city: 'Groesbeck', holes: 9, lat: 31.520, lng: -96.540 },
  { name: 'Legacy Trails DGC', city: 'Gatesville', holes: 18, lat: 31.437, lng: -97.734 },
  { name: 'Marlin City Park DGC', city: 'Marlin', holes: 10, lat: 31.309, lng: -97.585 },
  { name: 'John E Hejl Park at Davidson Creek DGC', city: 'Caldwell', holes: 18, lat: 30.526, lng: -96.563 },
  { name: 'Creeks Crossing at Rivergate Church DGC', city: 'College Station', holes: 18, lat: 30.587, lng: -96.298 },
  { name: 'Bonham Park DGC', city: 'Bryan', holes: 9, lat: 30.674, lng: -96.369 },
  { name: 'Jane Long Middle School DGC', city: 'Bryan', holes: 9, lat: 30.678, lng: -96.364 },
  { name: 'First Baptist Bryan DGC', city: 'Bryan', holes: 9, lat: 30.674, lng: -96.369 },
  { name: 'Austins Colony DGC', city: 'Bryan', holes: 9, lat: 30.652, lng: -96.365 },
  { name: 'Lakeview DGC', city: 'College Station', holes: 18, lat: 30.591, lng: -96.289 },
  { name: 'Veterans Memorial DGC', city: 'College Station', holes: 18, lat: 30.628, lng: -96.334 },

  // === LUBBOCK / PANHANDLE ===
  { name: "Children's Home of Lubbock DGC", city: 'Lubbock', holes: 18, lat: 33.585, lng: -101.823 },
  { name: 'Mackenzie Park - Big Mack DGC', city: 'Lubbock', holes: 18, lat: 33.609, lng: -101.844 },
  { name: 'Mackenzie Park - Original DGC', city: 'Lubbock', holes: 18, lat: 33.609, lng: -101.844 },
  { name: 'Mae Simmons Park DGC', city: 'Lubbock', holes: 18, lat: 33.571, lng: -101.851 },
  { name: 'Lubbock Christian University DGC', city: 'Lubbock', holes: 18, lat: 33.581, lng: -101.915 },
  { name: 'Clapp Park DGC', city: 'Lubbock', holes: 18, lat: 33.584, lng: -101.863 },
  { name: 'City Park DGC', city: 'Wolfforth', holes: 9, lat: 33.405, lng: -102.009 },
  { name: 'Levelland City Park DGC', city: 'Levelland', holes: 21, lat: 33.588, lng: -102.370 },
  { name: 'Forrest Park DGC', city: 'Lamesa', holes: 18, lat: 32.739, lng: -101.952 },
  { name: 'Laguna Park DGC', city: 'Littlefield', holes: 9, lat: 33.919, lng: -102.334 },
  { name: 'Andrews Wetlands Park DGC', city: 'Andrews', holes: 9, lat: 32.330, lng: -102.541 },
  { name: 'Beal Park DGC', city: 'Midland', holes: 18, lat: 31.998, lng: -102.085 },
  { name: 'Cowden Park DGC', city: 'Midland', holes: 9, lat: 31.998, lng: -102.085 },
  { name: 'Brady DGC', city: 'Brady', holes: 18, lat: 31.131, lng: -99.335 },
  { name: 'Comanche Trail Park - Mountain DGC', city: 'Big Spring', holes: 18, lat: 32.253, lng: -101.467 },
  { name: 'Comanche Trail Park - Lake DGC', city: 'Big Spring', holes: 18, lat: 32.253, lng: -101.467 },
  { name: 'Birdwell Park DGC', city: 'Big Spring', holes: 9, lat: 32.253, lng: -101.467 },
  { name: 'Comanche Trail South DGC', city: 'Odessa', holes: 21, lat: 31.845, lng: -102.367 },
  { name: 'Comanche Trail West DGC', city: 'Odessa', holes: 18, lat: 31.845, lng: -102.367 },
  { name: 'Ft. Stockton DGC', city: 'Fort Stockton', holes: 18, lat: 30.892, lng: -102.879 },
  { name: 'James Rooney Memorial Park DGC', city: 'Fort Stockton', holes: 20, lat: 30.892, lng: -102.879 },
  { name: 'Crane DGC', city: 'Crane', holes: 9, lat: 31.398, lng: -102.347 },
  { name: 'Disc Creek DGC at Thompson Park', city: 'Amarillo', holes: 28, lat: 35.222, lng: -101.831 },
  { name: 'Memorial Park DGC', city: 'Amarillo', holes: 18, lat: 35.222, lng: -101.831 },
  { name: 'Centennial Park DGC', city: 'Canadian', holes: 9, lat: 35.913, lng: -100.015 },
  { name: 'Fritch DGC', city: 'Fritch', holes: 9, lat: 35.639, lng: -101.569 },
  { name: 'Greenbelt Lake DGC at Kincaid Park West', city: 'Clarendon', holes: 18, lat: 34.939, lng: -100.908 },
  { name: 'Disc Golf at the Junction Golf Course', city: 'Junction', holes: 18, lat: 30.490, lng: -99.770 },
  { name: 'Kimble County Park DGC', city: 'Junction', holes: 18, lat: 30.490, lng: -99.770 },
  { name: 'Kickapoo Creek DGC', city: 'Bronte', holes: 9, lat: 31.879, lng: -100.537 },
  { name: 'Eagle Ranch DGC at Fort Worth', city: 'Fort Worth', holes: 9, lat: 32.958, lng: -97.417 },
  { name: 'Eagle Ranch DGC Park', city: 'Fort Worth', holes: 9, lat: 32.958, lng: -97.417 },
  { name: 'Dublin DGC', city: 'Dublin', holes: 19, lat: 32.054, lng: -98.532 },
  { name: 'Coleman City Park DGC', city: 'Coleman', holes: 9, lat: 31.827, lng: -99.425 },
  { name: 'Coleman Park DGC', city: 'Brownfield', holes: 18, lat: 33.180, lng: -102.265 },
  { name: 'Heart of Texas Camp DGC', city: 'Brownwood', holes: 9, lat: 31.722, lng: -98.981 },
  { name: 'Jim Ned DGC', city: 'Tuscola', holes: 9, lat: 32.209, lng: -98.944 },
  { name: 'Cobb Park DGC', city: 'Abilene', holes: 9, lat: 32.448, lng: -99.733 },
  { name: 'Cal Young Park DGC', city: 'Abilene', holes: 18, lat: 32.448, lng: -99.733 },
  { name: 'Johnson Park DGC', city: 'Abilene', holes: 18, lat: 32.448, lng: -99.733 },
  { name: 'Firemans Park DGC', city: 'Graham', holes: 9, lat: 33.107, lng: -98.587 },
  { name: 'Granbury City Park DGC', city: 'Granbury', holes: 21, lat: 32.443, lng: -97.776 },
  { name: 'Arcadia Veterans Memorial DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Broadway DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Southside DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Beechnut Battle DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Meadowbrook DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Lake Tyler DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Tyler State Park DGC', city: 'Tyler', holes: 18, lat: 32.351, lng: -95.255 },
  { name: 'Bonham VA Hospital DGC', city: 'Bonham', holes: 18, lat: 33.583, lng: -96.177 },
  { name: 'Andrew Brown Park DGC', city: 'Coppell', holes: 18, lat: 32.957, lng: -96.991 },

  // === EL PASO AREA ===
  { name: 'Lionel E Forti Park DGC', city: 'El Paso', holes: 18, lat: 31.763, lng: -106.303 },
  { name: 'Tom Lee Park DGC', city: 'El Paso', holes: 18, lat: 31.763, lng: -106.303 },
  { name: 'San Elizario DGC', city: 'San Elizario', holes: 18, lat: 31.575, lng: -106.277 },
  { name: 'Dragon Lady Links DGC', city: 'Laughlin AFB', holes: 9, lat: 29.368, lng: -100.780 },

  // === RIO GRANDE VALLEY / SOUTH TEXAS ===
  { name: 'Daffodil Park DGC', city: 'McAllen', holes: 9, lat: 26.203, lng: -98.239 },
  { name: 'Dixieland Park DGC', city: 'Harlingen', holes: 18, lat: 26.192, lng: -97.694 },
  { name: 'Lamar Park DGC', city: 'Corpus Christi', holes: 9, lat: 27.800, lng: -97.396 },
  { name: 'Billish Park DGC', city: 'Corpus Christi', holes: 9, lat: 27.800, lng: -97.396 },
  { name: 'Live Oak Gold DGC', city: 'Ingleside', holes: 18, lat: 28.041, lng: -97.542 },
  { name: 'Live Oak Red DGC', city: 'Ingleside', holes: 18, lat: 28.041, lng: -97.542 },
  { name: 'Live Oak Lakeside DGC', city: 'Live Oak', holes: 18, lat: 29.561, lng: -98.355 },
  { name: 'Live Oak Hillside DGC', city: 'Live Oak', holes: 19, lat: 29.561, lng: -98.355 },
  { name: 'Cenizo DGC', city: 'Edinburg', holes: 9, lat: 26.301, lng: -98.163 },
  { name: 'Kenedy DGC', city: 'Kenedy', holes: 9, lat: 28.814, lng: -97.850 },
  { name: 'Lions Park DGC', city: 'San Juan', holes: 6, lat: 26.189, lng: -98.154 },
  { name: 'Brazos Park DGC', city: 'Rosenberg', holes: 9, lat: 29.557, lng: -95.809 },

  // === COASTAL / GULF ===
  { name: 'Clute Park DGC', city: 'Clute', holes: 18, lat: 29.022, lng: -95.431 },
  { name: 'J.T. Dunbar Park DGC', city: 'Lake Jackson', holes: 18, lat: 29.033, lng: -95.431 },
  { name: 'Bayou Bend DGC', city: 'Deer Park', holes: 9, lat: 29.708, lng: -95.120 },
  { name: 'Bay Street Park DGC', city: 'Texas City', holes: 18, lat: 29.384, lng: -94.947 },
  { name: 'Bates Park DGC', city: 'Angleton', holes: 18, lat: 29.169, lng: -95.435 },
  { name: 'Le Tulle Park DGC', city: 'Bay City', holes: 24, lat: 28.982, lng: -95.961 },
  { name: 'Bobby Ford Park DGC', city: 'Richwood', holes: 9, lat: 29.063, lng: -95.459 },
  { name: 'Centennial Park DGC', city: 'Pearland', holes: 9, lat: 29.564, lng: -95.286 },

  // === MISC SMALLER MARKETS ===
  { name: 'Jackson Bros DGC', city: 'New Waverly', holes: 20, lat: 30.540, lng: -95.481 },
  { name: 'Camp All Saints Macro DGC', city: 'Pottsboro', holes: 9, lat: 33.787, lng: -96.678 },
  { name: 'Camp Allen DGC', city: 'Navasota', holes: 21, lat: 30.370, lng: -96.093 },
  { name: '7 Acre Park DGC', city: 'Flatonia', holes: 6, lat: 29.725, lng: -97.052 },
  { name: 'Backyard Park DGC', city: 'Sweeny', holes: 9, lat: 29.037, lng: -95.745 },
  { name: 'Badu Park DGC', city: 'Llano', holes: 9, lat: 30.759, lng: -98.677 },
  { name: 'Bailey Lake DGC', city: 'Burleson', holes: 9, lat: 32.542, lng: -97.318 },
  { name: 'Ballinger City Park DGC', city: 'Ballinger', holes: 9, lat: 31.733, lng: -99.946 },
  { name: 'Bethany Lakes DGC', city: 'Allen', holes: 9, lat: 33.103, lng: -96.670 },
  { name: 'Bicentennial DGC', city: 'Crowley', holes: 21, lat: 32.534, lng: -97.366 },
  { name: 'Bill Allen Memorial Park DGC', city: 'The Colony', holes: 18, lat: 33.080, lng: -96.891 },
  { name: 'Bear Branch Sportsfield Park DGC', city: 'The Woodlands', holes: 18, lat: 30.160, lng: -95.458 },
  { name: 'Wildcat DGC', city: 'The Woodlands', holes: 18, lat: 30.160, lng: -95.458 },
  { name: 'Maresk Line DGC', city: 'The Woodlands', holes: 6, lat: 30.160, lng: -95.458 },
  { name: 'Bear Creek Baptist Church DGC', city: 'Glenn Heights', holes: 9, lat: 32.659, lng: -96.800 },
  { name: 'Boys Ranch DGC', city: 'Bedford', holes: 9, lat: 32.844, lng: -97.144 },
  { name: 'Brushy Creek Sports Park DGC', city: 'Cedar Park', holes: 9, lat: 30.505, lng: -97.826 },
  { name: 'Conder Park DGC', city: 'Killeen', holes: 9, lat: 31.117, lng: -97.727 },
  { name: 'CTC Eagles DGC', city: 'Killeen', holes: 9, lat: 31.117, lng: -97.727 },
  { name: 'Heritage Oaks Trail DGC', city: 'Killeen', holes: 28, lat: 31.117, lng: -97.727 },
  { name: 'Maxdale Park DGC', city: 'Killeen', holes: 18, lat: 31.117, lng: -97.727 },
  { name: 'Eastham-Thomason Park DGC', city: 'Huntsville', holes: 9, lat: 30.723, lng: -95.535 },
  { name: 'First Baptist Church DGC', city: 'Livingston', holes: 6, lat: 30.711, lng: -94.931 },
  { name: 'Goodfellow Air Force Base DGC', city: 'San Angelo', holes: 9, lat: 31.420, lng: -100.456 },
  { name: 'Fredericksburg Middle School DGC', city: 'Fredericksburg', holes: 9, lat: 30.270, lng: -98.872 },
  { name: 'CoServ Lost Pines DGC', city: 'Corinth', holes: 18, lat: 33.129, lng: -97.062 },
  { name: 'Flite Zone TX DGC', city: 'Fairfield', holes: 18, lat: 31.956, lng: -96.154 },
  { name: 'Fair Park DGC', city: 'Childress', holes: 9, lat: 34.252, lng: -100.200 },
  { name: 'GracePoint Fellowship DGC', city: 'Magnolia', holes: 9, lat: 30.220, lng: -95.754 },
  { name: "Magnolia's First DGC", city: 'Magnolia', holes: 18, lat: 30.220, lng: -95.754 },
  { name: 'Jones Park DGC', city: 'Decatur', holes: 18, lat: 33.234, lng: -97.582 },
  { name: 'Justin DGC', city: 'Justin', holes: 9, lat: 33.083, lng: -97.295 },
  { name: 'Lakeside City DGC', city: 'Lakeside City', holes: 9, lat: 33.886, lng: -98.497 },
  { name: 'Lynn Bush DGC', city: 'Bogota', holes: 9, lat: 33.456, lng: -95.215 },
  { name: 'Marilyn Anderson Memorial DGC', city: 'Lockney', holes: 9, lat: 34.302, lng: -100.560 },
  { name: 'La Vernla City Park DGC', city: 'La Vernla', holes: 9, lat: 29.367, lng: -98.558 },
  { name: 'Kiwanis Park DGC', city: 'Lufkin', holes: 9, lat: 31.338, lng: -94.729 },
  { name: 'Kountze DGC', city: 'Kountze', holes: 9, lat: 30.375, lng: -94.307 },
  { name: 'Lake Nacogdoches West DGC', city: 'Nacogdoches', holes: 18, lat: 31.603, lng: -94.655 },
  { name: 'Little Banita DGC', city: 'Nacogdoches', holes: 9, lat: 31.603, lng: -94.655 },
  { name: 'Lone Star DGC', city: 'The Woodlands', holes: 18, lat: 30.160, lng: -95.458 },
  { name: 'Liberty Lake Park DGC', city: 'Spring', holes: 9, lat: 30.092, lng: -95.406 },
  { name: 'Cypresswood DGC', city: 'Spring', holes: 9, lat: 30.092, lng: -95.406 },
  { name: 'CrossPoint Community Church DGC', city: 'Katy', holes: 9, lat: 29.786, lng: -95.771 },
  { name: 'Mary Jo Peckham DGC', city: 'Katy', holes: 6, lat: 29.786, lng: -95.771 },
  { name: 'HCA DGC', city: 'Katy', holes: 18, lat: 29.786, lng: -95.771 },
  { name: 'Creekwood DGC', city: 'Kingwood', holes: 6, lat: 30.045, lng: -95.018 },
  { name: 'Mauriceville Middle School DGC', city: 'Mauriceville', holes: 9, lat: 30.269, lng: -93.868 },
  { name: 'DeBusk Park DGC', city: 'Mesquite', holes: 9, lat: 32.764, lng: -96.599 },
  { name: 'Northside Christian Church DGC', city: 'Spring', holes: 18, lat: 30.092, lng: -95.406 },
  { name: 'Dashs Track DGC', city: 'Frisco', holes: 18, lat: 33.151, lng: -96.823 },
  { name: 'Griffin Middle School DGC', city: 'The Colony', holes: 6, lat: 33.080, lng: -96.891 },
  { name: 'Jellystone Park DGC', city: 'Canyon Lake', holes: 9, lat: 29.884, lng: -98.143 },
  { name: 'Lockhart City Park DGC', city: 'Lockhart', holes: 9, lat: 29.879, lng: -97.675 },
  { name: 'Lorena Middle School DGC', city: 'Lorena', holes: 9, lat: 31.387, lng: -97.223 },
  { name: 'Lost Pines Resort DGC', city: 'Lost Pines', holes: 9, lat: 30.128, lng: -97.410 },
  { name: 'Bob Bryant DGC', city: 'Bastrop', holes: 18, lat: 30.110, lng: -97.323 },
  { name: 'Flying Armadillo DGC Club Big Course', city: 'San Marcos', holes: 18, lat: 29.883, lng: -97.941 },
  { name: 'Flying Armadillo DGC Club Gold Mini', city: 'San Marcos', holes: 18, lat: 29.883, lng: -97.941 },
  { name: 'Acuna Jr DGC', city: 'San Antonio', holes: 18, lat: 29.424, lng: -98.494 },
  { name: 'Hernandez DGC', city: 'San Antonio', holes: 18, lat: 29.424, lng: -98.494 },
  { name: 'Blackberry Pines DGC', city: 'Pittsburg', holes: 20, lat: 32.995, lng: -95.969 },
  { name: 'Trophy Club Park DGC', city: 'Trophy Club', holes: 18, lat: 33.001, lng: -97.115 },
  { name: 'Heritage Park DGC', city: 'Flower Mound', holes: 18, lat: 33.014, lng: -97.078 },
  { name: 'McKinney National Airport DGC', city: 'McKinney', holes: 18, lat: 33.178, lng: -96.598 },
  { name: 'Dino Hills DGC Farm', city: 'Walnut Springs', holes: 18, lat: 32.066, lng: -97.397 },
  { name: 'Hewitt Park DGC', city: 'Hewitt', holes: 18, lat: 31.452, lng: -97.195 },
  { name: 'Johnson Park DGC', city: 'Borger', holes: 18, lat: 35.688, lng: -101.394 },
];

function normalize(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function main() {
  const client = await pool.connect();
  try {
    // Get existing course names
    const existingResult = await client.query(
      `SELECT LOWER(name) as name_lower FROM courses WHERE state = 'Texas'`
    );
    const existingSet = new Set(existingResult.rows.map(r => r.name_lower));
    console.log(`Existing Texas courses: ${existingSet.size}`);

    const toInsert = newCourses.filter(c => !existingSet.has(normalize(c.name)));
    console.log(`New courses to insert: ${toInsert.length}`);

    if (toInsert.length === 0) {
      console.log('Nothing to insert.');
      return;
    }

    await client.query('BEGIN');

    const insertCourseSQL = `
      INSERT INTO courses (name, city, state, lat, lng, holes, source, hole_count, is_active, created_at, updated_at)
      VALUES ($1, $2, 'Texas', $3, $4, $5, 'pdga_import', $5, true, NOW(), NOW())
      RETURNING id
    `;
    const insertLayoutSQL = `
      INSERT INTO course_layouts (course_id, name, hole_count, is_default, created_at)
      VALUES ($1, 'Default', $2, true, NOW())
    `;

    let inserted = 0;
    let skipped = 0;

    for (const course of toInsert) {
      try {
        const result = await client.query(insertCourseSQL, [
          course.name, course.city, course.lat, course.lng, course.holes
        ]);
        await client.query(insertLayoutSQL, [result.rows[0].id, course.holes]);
        console.log(`INSERT: ${course.name} (${course.city}, ${course.holes} holes)`);
        inserted++;
      } catch (err) {
        if (err.code === '23505') {
          console.log(`SKIP (duplicate): ${course.name}`);
          skipped++;
        } else {
          console.error(`ERROR: ${course.name}: ${err.message}`);
        }
      }
    }

    await client.query('COMMIT');
    console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}, Total new: ${toInsert.length}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });