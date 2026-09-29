import { describe, expect, test } from "vitest";
import { propagateTo, telemetryMode } from "@/lib/telemetry";

describe("telemetryMode", () => {
  test("OTLP endpoint wins over Application Insights", () => {
    expect(
      telemetryMode({
        OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
        APPLICATIONINSIGHTS_CONNECTION_STRING: "InstrumentationKey=x",
      }),
    ).toBe("otlp");
  });
  test("Application Insights alone", () => {
    expect(
      telemetryMode({
        APPLICATIONINSIGHTS_CONNECTION_STRING: "InstrumentationKey=x",
      }),
    ).toBe("azure");
  });
  test("nothing configured", () => {
    expect(telemetryMode({})).toBe("off");
  });
});

test("propagateTo names the api and assistant origins, with defaults", () => {
  expect(propagateTo({})).toEqual([
    "http://localhost:5080",
    "http://localhost:8000",
  ]);
  expect(
    propagateTo({
      PORTAL_API_URL: "http://api:5080",
      ASSISTANT_URL: "http://assistant:8000",
    }),
  ).toEqual(["http://api:5080", "http://assistant:8000"]);
});
