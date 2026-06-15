import type { MetadataRoute } from 'next';

const SITE_URL = 'https://missioncontrol.ghray.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/ai-agent-orchestration-platform`,
      lastModified,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/activity`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/autopilot`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ];
}
