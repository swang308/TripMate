const NOMINATIM_API = "https://nominatim.openstreetmap.org/search";

export async function geocodePlace(placeName, options = {}) {
  try {
    const isListRequested = options.returnList === true;

    const params = new URLSearchParams({
      q: placeName,
      format: "json",
      limit: isListRequested ? "5" : "1",
      addressdetails: "1",
    });

    const response = await fetch(`${NOMINATIM_API}?${params}`, {
      headers: {
        "User-Agent": "TripMate App",
      },
    });

    if (!response.ok) {
      throw new Error("Geocoding request failed");
    }

    const data = await response.json();

    if (data && data.length > 0) {
      if (isListRequested) {
        return data.map((item) => ({
          id: item.place_id,
          name: item.display_name,
          formattedName: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          city: item.address?.city || item.address?.town || item.address?.village || item.address?.municipality || "",
          country: item.address?.country || "",
        }));
      }

      const result = data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        city: result.address?.city || result.address?.town || result.address?.village || result.address?.municipality || "",
        country: result.address?.country || "",
      };
    }

    return null;
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

export async function geocodePlaces(placeNames) {
  const promises = placeNames.map(async (name) => {
    const coords = await geocodePlace(name);
    if (coords) {
      return { name, ...coords };
    }
    return null;
  });

  return Promise.all(promises);
}
