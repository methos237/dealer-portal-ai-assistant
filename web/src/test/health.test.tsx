import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import HealthPage from "@/app/health/page";

test("health page reports ok", () => {
  render(<HealthPage />);
  expect(screen.getByTestId("status")).toHaveTextContent("ok");
});
