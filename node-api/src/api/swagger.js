const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Doküman Analiz API",
      version: "1.0.0",
      description:
        "Base64 görsel alır, doküman tipini ve güven yüzdesini döner. " +
        "Kimlik doğrulaması yoktur; servis dahili kullanım içindir.",
    },
    servers: [{ url: "http://localhost:3000" }],
  },
  apis: ["./src/api/routes.js"],
});

module.exports = { swaggerUi, spec };
