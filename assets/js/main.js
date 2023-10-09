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
];

let locCache = {};
let mapMarkers = [];

// https://docs.developer.yelp.com/reference/v3_business_search
async function getCurrentLocation() {
  if ("latitude" in locCache) return locCache;
  const loc = await new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition((pos) => res(pos.coords), rej);
  });
  locCache = loc;
  return loc;
}

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
  params.set("limit", 40);

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
    if (existingAddress.includes(address)) return false;
    existingAddress.push(address);
    if (b.categories.find((c) => excludedCategories.includes(c.alias)))
      return false;
    return true;
  });
  return businesses;
}

async function addMapMarkers(places) {
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  const { InfoWindow } = await google.maps.importLibrary("maps");
  const infoWindow = new InfoWindow();
  for (let place of places) {
    const coords = place.coordinates;
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

function clearMapMarkers() {
  for (let marker of mapMarkers) {
    marker.map = null;
  }
  mapMarkers = [];
}

async function initMap(e) {
  const { Map } = await google.maps.importLibrary("maps");
  const loc = await getCurrentLocation();

  window.googleMap = new Map(document.getElementById("map"), {
    center: { lat: loc.latitude, lng: loc.longitude },
    zoom: 15,
    mapId,
  });
}

initMap();
