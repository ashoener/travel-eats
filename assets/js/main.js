const corsProxyUrl = "http://134.195.14.94:8051/";
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

// https://docs.developer.yelp.com/reference/v3_business_search
async function getCurrentLocation() {
  return new Promise((res, rej) => {
    navigator.geolocation.getCurrentPosition((pos) => res(pos.coords), rej);
  });
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
