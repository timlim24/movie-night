// Runtime config written by Terraform to /config.json — the same build runs in any environment.
export type AppConfig = {
  cognitoDomain: string
  clientId: string
  googleEnabled: boolean
  donateUrl?: string
}

let config: AppConfig | null = null

export async function loadConfig(): Promise<AppConfig> {
  if (config) return config
  const res = await fetch('/config.json', { cache: 'no-store' })
  if (!res.ok) throw new Error('config.json is missing')
  config = (await res.json()) as AppConfig
  return config
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('config not loaded')
  return config
}
