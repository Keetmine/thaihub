import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  async redirects() {
    return [
      // Раздел /performers переименован в /artists — сохранённые ссылки
      // (включая query вида ?view=bands) редиректятся навсегда.
      {
        source: "/performers",
        destination: "/artists",
        permanent: true,
      },
      {
        source: "/performers/:slug",
        destination: "/artists/:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
