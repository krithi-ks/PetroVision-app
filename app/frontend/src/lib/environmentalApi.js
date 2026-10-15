const MARINE_API = 'https://marine-api.open-meteo.com/v1/marine'
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast'

export class EnvironmentalApiError extends Error {
  constructor(message, { code = 'environmental_api_error' } = {}) {
    super(message)
    this.name = 'EnvironmentalApiError'
    this.code = code
  }
}

/**
 * Fetches live environmental context for PetroVision.
 *
 * This data is contextual information only.
 * It does NOT predict spill movement or identify fuel type.
 */
export async function fetchEnvironmentalData({
  latitude,
  longitude,
}) {
  if (
    !Number.isFinite(Number(latitude)) ||
    !Number.isFinite(Number(longitude))
  ) {
    throw new EnvironmentalApiError(
      'A valid monitoring location is required.',
      { code: 'invalid_location' },
    )
  }

  const lat = Number(latitude)
  const lon = Number(longitude)

  const marineParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),

    hourly: [
      'wave_height',
      'wave_direction',
      'ocean_current_velocity',
      'ocean_current_direction',
      'sea_surface_temperature',
    ].join(','),

    forecast_days: '1',
    timezone: 'auto',
    cell_selection: 'sea',
  })

  const weatherParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),

    current: [
      'wind_speed_10m',
      'wind_direction_10m',
    ].join(','),

    timezone: 'auto',
  })

  try {
    const [marineResponse, weatherResponse] =
      await Promise.all([
        fetch(`${MARINE_API}?${marineParams}`),
        fetch(`${WEATHER_API}?${weatherParams}`),
      ])

    if (!marineResponse.ok) {
      throw new EnvironmentalApiError(
        `Marine API request failed (${marineResponse.status}).`,
        { code: 'marine_api_error' },
      )
    }

    if (!weatherResponse.ok) {
      throw new EnvironmentalApiError(
        `Weather API request failed (${weatherResponse.status}).`,
        { code: 'weather_api_error' },
      )
    }

    const marine = await marineResponse.json()
    const weather = await weatherResponse.json()

    const currentIndex = findCurrentMarineIndex(
      marine.hourly?.time,
    )

    return {
      location: {
        latitude: lat,
        longitude: lon,
        timezone:
          marine.timezone ||
          weather.timezone ||
          'auto',
      },

      wind: {
        speed:
          weather.current?.wind_speed_10m ?? null,
        direction:
          weather.current?.wind_direction_10m ?? null,
        unit:
          weather.current_units?.wind_speed_10m ||
          'km/h',
      },

      wave: {
        height:
          getHourlyValue(
            marine.hourly?.wave_height,
            currentIndex,
          ),
        direction:
          getHourlyValue(
            marine.hourly?.wave_direction,
            currentIndex,
          ),
        unit:
          marine.hourly_units?.wave_height ||
          'm',
      },

      current: {
        speed:
          getHourlyValue(
            marine.hourly?.ocean_current_velocity,
            currentIndex,
          ),
        direction:
          getHourlyValue(
            marine.hourly?.ocean_current_direction,
            currentIndex,
          ),
        unit:
          marine.hourly_units?.ocean_current_velocity ||
          'm/s',
      },

      seaSurfaceTemperature:
        getHourlyValue(
          marine.hourly?.sea_surface_temperature,
          currentIndex,
        ),

      seaSurfaceTemperatureUnit:
        marine.hourly_units?.sea_surface_temperature ||
        '°C',

      observedAt:
        marine.hourly?.time?.[currentIndex] ||
        marine.hourly?.time?.[0] ||
        null,

      source: 'Open-Meteo',
    }
  } catch (error) {
    if (error instanceof EnvironmentalApiError) {
      throw error
    }

    throw new EnvironmentalApiError(
      'Unable to retrieve live environmental conditions.',
      { code: 'network_error' },
    )
  }
}

function getHourlyValue(values, index) {
  if (!Array.isArray(values) || values.length === 0) {
    return null
  }

  const value = values[index]

  return Number.isFinite(Number(value))
    ? Number(value)
    : null
}

function findCurrentMarineIndex(times) {
  if (!Array.isArray(times) || times.length === 0) {
    return 0
  }

  const now = Date.now()

  let closestIndex = 0
  let smallestDifference = Infinity

  times.forEach((time, index) => {
    const timestamp = Date.parse(time)

    if (!Number.isFinite(timestamp)) {
      return
    }

    const difference = Math.abs(timestamp - now)

    if (difference < smallestDifference) {
      smallestDifference = difference
      closestIndex = index
    }
  })

  return closestIndex
}