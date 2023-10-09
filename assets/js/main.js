const corsProxyUrl = "http://134.195.14.94:8051/";
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

let locCache = {};
let mapMarkers = [];

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
    await addMapMarkers(places);
    //   Set center to first location
    const firstCoords = places[0].coordinates;
    googleMap.setCenter({
      lat: firstCoords.latitude,
      lng: firstCoords.longitude,
    });
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
      const { target } = domEvent;

      infoWindow.close();
      infoWindow.setContent(
        [
          `<strong>${marker.title}</strong>`,
          ...place.location.display_address,
          `<a href="https://www.google.com/maps/place/${encodeURIComponent(
            place.location.display_address.join(", ")
          )}" target="_blank">View on Google Maps</a>`,
          `<a href="${place.url}" target="_blank">View Information</a>`,
        ].join("<br>")
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
  } catch (e) {
    loc = defaultLocation;
    //   TODO: show an error message?
  }

  window.googleMap = new Map(document.getElementById("map"), {
    center: { lat: loc.latitude, lng: loc.longitude },
    zoom: 15,
    mapId,
  });

  // Load markers based on default location
  await addMapMarkers(await searchYelp(loc));
}

initMap();

// Add css for local debugging only
if (location.hostname == "127.0.0.1") {
  const debugStyle = $(`<style>
      #map {
        height: 100%;
      }
      html,
      body {
        height: 100%;
        margin: 0;
        padding: 0;
      }
</style>`);

  $("head").append(debugStyle);
}
