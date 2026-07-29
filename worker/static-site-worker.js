const worker = {
  async fetch(request, env) {
    const method = request.method.toUpperCase();

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/assets/")) {
      return assetResponse;
    }

    url.pathname = "/index.html";
    return env.ASSETS.fetch(new Request(url, request));
  },
};

export default worker;
