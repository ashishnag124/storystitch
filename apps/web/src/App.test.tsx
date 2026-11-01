import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("AC-PICK-01 AC-PRIV-02 starts on photo picking and says photos stay on the device", () => {
    render(<App />);
    const input = screen.getByLabelText("Upload photos") as HTMLInputElement; // jsdom counts as desktop
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(true);
    expect(input.accept).toContain(".heic");
    expect(screen.getByText(/nothing is uploaded/i)).toBeTruthy();
  });
});
