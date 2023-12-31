const corsProxyUrl = "https://cors.133700.xyz/";
const mapId = "5ed84f6a72f0bdb7";
const yelpApiKey =
  "YKZv5pI1m6Q1sXsMu3GIrrFrGzsvx6gLKRAMct8l90LQHCIQFI5lhsqc_po2q4w_juN71vfJTi1_EBbO3CU3flSKoo25L4RgDSfIj6SU46bHUq7RJkUFHvj3xhwkZXYx";
const excludedCategories = [
  "convenience",
  "discountstore",
  "servicestations",
  "beer_and_wine",
  "waterstores",
  "grocery",
  "healthmarkets",
];

// Default location is Austin
const defaultLocation = {
  latitude: 30.3079541,
  longitude: -97.9205502,
};

let maxSearchesSaved = 5;
let locCache = {};
let mapMarkers = [];
/**
 * @type {String[]}
 */
let searches = JSON.parse(localStorage.getItem("searches")) || [];
let placeUrlCache = JSON.parse(localStorage.getItem("place_urls")) || {};

const searchArea = $("#searchbar [name=searchArea]");
const searchForm = $("#search-form");
const currentLocation = $("#userCurrentLocation");
const locations = $("#locations");

/**
 * Returns a unique ID for a place
 * @param {Place} place
 * @returns {String}
 */
function getPlaceUrlCacheId(place) {
  return `${place.name}${place.coordinates.latitude},${place.coordinates.longitude}`;
}

/**
 * Updates the search bar autocomplete list
 */
function updateSearches() {
  $("#searchbar").search({
    source: searches.map((s) => ({ title: s })),
    showNoResults: false,
  });
}

searchForm.form({
  fields: {
    searchArea: "minLength[2]",
  },
});

searchForm.on("submit", async (e) => {
  e.preventDefault();
  if (searchForm.form("is valid")) {
    $("#searchbar").toggleClass("loading");
    await searchAndDisplay(searchArea.val());
    searchForm.form("reset");
    $("#searchbar").toggleClass("loading");
  }
});

$("#searchbar i").on("click", (e) => searchForm.submit());

updateSearches();

/**
 * @typedef Place
 * @property {String} name
 * @property {{
 *      latitude: number,
 *      longitude: number
 * }} coordinates
 * @property {Array<{
 *      alias: String,
 *      title: String
 * }>} categories
 * @property {{
 *      address1: String,
 *      address2: String,
 *      address3: String | null,
 *      city: String,
 *      state: String,
 *      country: String,
 *      display_address: String[]
 * }} location
 * @property {String} url
 */

/**
 * Get the current location of the user
 * @returns {Promise<{
 *      latitude: number,
 *      longitude: number
 * }>}
 */
async function getCurrentLocation() {
  if ("latitude" in locCache) return locCache;
  const loc = await new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition((pos) => res(pos.coords), rej);
  });
  locCache = loc;
  return loc;
}

/**
 * Search for places on Yelp, and display them on the map
 * @param {{
 *      latitude: number,
 *      longitude: number
 * }| String} location
 */
async function searchAndDisplay(location) {
  clearMapMarkers();
  const places = await searchYelp(location);
  if (places.length) {
    if (typeof location == "string") {
      if (!searches.includes(location)) {
        searches.push(location);
        if (searches.length > maxSearchesSaved) searches.shift();
        localStorage.setItem("searches", JSON.stringify(searches));
        updateSearches();
      }
      currentLocation.text(location);
    }
    locations.html("");
    const placesInCache = Object.keys(placeUrlCache).length;
    await addMapMarkers(places);
    const firstCoords = places[0].coordinates;
    //   Set center to first location
    googleMap.setCenter({
      lat: firstCoords.latitude,
      lng: firstCoords.longitude,
    });
    for (let place of places) {
      const coords = place.coordinates;
      const cacheId = getPlaceUrlCacheId(place);
      if (cacheId in placeUrlCache) {
        place.maps_url = placeUrlCache[cacheId];
      } else {
        await new Promise((res, rej) => {
          window.mapService.findPlaceFromQuery(
            {
              query: place.name,
              fields: ["place_id"],
              locationBias: { lat: coords.latitude, lng: coords.longitude },
            },
            (results, status) => {
              if (
                status === google.maps.places.PlacesServiceStatus.OK &&
                results
              ) {
                place.maps_url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  place.name
                )}&query_place_id=${results[0].place_id}`;
                placeUrlCache[cacheId] = place.maps_url;
                res();
              } else {
                res();
              }
            }
          );
        });
      }
      const el = $(`
                  <div class="item">
                    <div class="content">
                      <div class="header">${place.name}</div>
                      ${
                        "maps_url" in place
                          ? `<a href="${place.maps_url}" target="_blank">View on Google Maps</a>`
                          : ""
                      }
                      <br>
                      <a href="${
                        place.url
                      }" target="_blank">View Information</a>
                    </div>
                  </div>`);
      locations.append(el);
    }
    if (Object.keys(placeUrlCache).length != placesInCache)
      localStorage.setItem("place_urls", JSON.stringify(placeUrlCache));
  }
}

// https://docs.developer.yelp.com/reference/v3_business_search
/**
 * Search the Yelp API for any businesses that sell food, within 5 miles, and up to 40 results.
 * @param {{
 *      latitude: number,
 *      longitude: number
 * }| String} location
 * @returns {Promise<Array<Place>>}
 */
async function searchYelp(location) {
  const params = new URLSearchParams();
  if (typeof location == "object") {
    params.set("latitude", location.latitude);
    params.set("longitude", location.longitude);
  } else {
    params.set("location", location);
  }
  params.set("term", "food");
  params.set("categories", "");
  params.set("sort_by", "distance");
  params.set("radius", "8000"); // approximately 5 miles
  params.set("limit", 50);

  const data = await fetch(
    corsProxyUrl +
      "https://api.yelp.com/v3/businesses/search?" +
      params.toString(),
    {
      method: "GET",
      headers: {
        accept: "application/json",
        Authorization: "Bearer " + yelpApiKey,
      },
    }
  )
    .then((response) => response.json())
    .catch((err) => console.error(err));
  const existingAddress = [];
  const businesses = data.businesses.filter((b) => {
    const address = b.location.address1;
    //   Check if address is already in list. This filters out duplicate entries.
    if (existingAddress.includes(address)) return false;
    existingAddress.push(address);
    //   Remove categories that indicate the location being something other than a restaurant
    //   or food establishment
    if (b.categories.find((c) => excludedCategories.includes(c.alias)))
      return false;
    return true;
  });
  return businesses;
}

/**
 * Add map markers for an array of locations returned by the Yelp API.
 * @param {Array<Place>} places
 */
async function addMapMarkers(places) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const { InfoWindow } = await google.maps.importLibrary("maps");
  const infoWindow = new InfoWindow();
  for (let place of places) {
    const coords = place.coordinates;
    if (coords.latitude === null || coords.longitude === null) continue;
    const marker = new AdvancedMarkerElement({
      map: window.googleMap,
      title: place.name,
      position: { lat: coords.latitude, lng: coords.longitude },
    });
    mapMarkers.push(marker);

    marker.addListener("click", ({ domEvent, latLng }) => {
      function displayPlace(url) {
        infoWindow.setContent(
          [
            `<strong>${marker.title}</strong>`,
            ...place.location.display_address,
            "Currently " + (place.is_closed ? "Closed" : "Open"),
            `<a href="${url}" target="_blank">View on Google Maps</a>`,
            `<a href="${place.url}" target="_blank">View Information</a>`,
          ].join("<br>")
        );
      }
      infoWindow.close();
      displayPlace(
        place.maps_url ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            place.name
          )}`
      );
      infoWindow.open(marker.map, marker);
    });
  }
}

/**
 * Remove all of the map markers
 */
function clearMapMarkers() {
  for (let marker of mapMarkers) {
    marker.map = null;
  }
  mapMarkers = [];
}

/**
 * Load the map
 */
async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");
  let loc;
  try {
    loc = await getCurrentLocation();
    currentLocation.text("Your Location");
  } catch (e) {
    loc = defaultLocation;
    currentLocation.text("Austin, TX");
    //   TODO: show an error message?
  }

  window.googleMap = new Map(document.getElementById("map"), {
    center: { lat: loc.latitude, lng: loc.longitude },
    zoom: 13,
    mapId,
  });
  const { PlacesService } = await google.maps.importLibrary("places");
  window.mapService = new PlacesService(window.googleMap);

  // Load markers based on default location
  // await addMapMarkers(await searchYelp(loc));
  searchAndDisplay(loc);
}

initMap();
