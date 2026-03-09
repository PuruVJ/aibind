import { tool } from "ai";
import { z } from "zod";

export const toolsets = {
  assistant: {
    get_weather: tool({
      description: "Get current weather for a city",
      inputSchema: z.object({
        city: z.string().describe('City name, e.g. "San Francisco"'),
      }),
      execute: async ({ city }) => ({
        city,
        temperature_c: Math.round(10 + Math.random() * 25),
        condition: ["sunny", "cloudy", "rainy", "partly cloudy"][
          Math.floor(Math.random() * 4)
        ],
        humidity: Math.round(40 + Math.random() * 40) + "%",
      }),
    }),
    get_time: tool({
      description: "Get the current date and time",
      inputSchema: z.object({}),
      execute: async () => ({
        time: new Date().toLocaleTimeString("en-US"),
        date: new Date().toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      }),
    }),
  },
};
