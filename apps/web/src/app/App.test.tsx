// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { createTrainingDatabase, type TrainingDatabase } from "../storage/training-database";
import { App } from "./App";

describe("Plan & Train", () => {
  let database: TrainingDatabase | undefined;

  afterEach(async () => {
    await database?.delete();
  });

  it("starts the acceptance routine from Today in the Session Runner", async () => {
    const user = userEvent.setup();
    database = createTrainingDatabase(`app-${crypto.randomUUID()}`, { indexedDB, IDBKeyRange });

    render(<App database={database} />);

    expect(await screen.findByRole("heading", { name: "Today's focus" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start session" }));

    expect(await screen.findByRole("heading", { name: "Stretching" })).toBeInTheDocument();
    expect(screen.getByText("1:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });
});
