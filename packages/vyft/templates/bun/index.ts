const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  fetch() {
    return new Response("Hello from Vyft!");
  },
});

console.log(`Listening on ${server.url}`);
