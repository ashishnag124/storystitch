import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("asks for photos and keeps export disabled until two are picked", () => {
    render(<App />);
    expect(screen.getByLabelText(/choose 2 photos/i)).toBeTruthy();
    expect(screen.getByText(/nothing is uploaded/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /export jpeg/i }) as HTMLButtonElement).disabled).toBe(true);
  });
});
