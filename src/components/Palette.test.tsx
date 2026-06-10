import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Host } from "../lib/types";
import { Palette } from "./Palette";

const host = (over: Partial<Host>): Host => ({
  id: "id",
  label: "label",
  user: "root",
  host: "example.com",
  port: 22,
  env: "dev",
  auth: "agent",
  identity: "",
  jump: "",
  fav: false,
  forwards: [],
  compression: false,
  keepalive: false,
  x11: false,
  ...over,
});

const HOSTS: Host[] = [
  host({ id: "web", label: "web-prod", host: "web.example.com", user: "deploy", env: "prod" }),
  host({ id: "db", label: "db-primary", host: "10.0.0.5", user: "postgres", env: "staging" }),
  host({ id: "pi", label: "raspberry", host: "pi.local", user: "pi", env: "personal" }),
];

function setup(hosts: Host[] = HOSTS) {
  const props = {
    onConnect: vi.fn(),
    onNew: vi.fn(),
    onEdit: vi.fn(),
    onImport: vi.fn(),
    onSettings: vi.fn(),
    onClose: vi.fn(),
  };
  render(<Palette hosts={hosts} {...props} />);
  const input = screen.getByPlaceholderText(/search hosts/i);
  return { props, input };
}

afterEach(cleanup);

describe("Palette filtering", () => {
  it("shows all hosts and all actions with no query", () => {
    setup();
    expect(screen.getByText("Hosts · 3")).toBeTruthy();
    // appears in the list and again in the preview pane
    expect(screen.getAllByText("web-prod").length).toBeGreaterThan(0);
    expect(screen.getByText("New connection…")).toBeTruthy();
    expect(screen.getByText("Import ssh config")).toBeTruthy();
    expect(screen.getByText("Open settings")).toBeTruthy();
  });

  it("filters by label", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "raspberry" } });
    expect(screen.getByText("Hosts · 1")).toBeTruthy();
    expect(screen.queryByText("web-prod")).toBeNull();
  });

  it("filters by hostname, user, and env", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "10.0.0.5" } });
    expect(screen.getByText("Hosts · 1")).toBeTruthy();

    fireEvent.change(input, { target: { value: "deploy" } });
    expect(screen.getByText("Hosts · 1")).toBeTruthy();

    fireEvent.change(input, { target: { value: "staging" } });
    expect(screen.getByText("Hosts · 1")).toBeTruthy();
  });

  it("is case-insensitive and trims whitespace", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "  WEB-PROD  " } });
    expect(screen.getByText("Hosts · 1")).toBeTruthy();
  });

  it("filters actions by label too", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "import" } });
    expect(screen.queryByText("Hosts · 3")).toBeNull();
    // matched part of the label is wrapped in a highlight span, so match on
    // the full text content of the label element
    expect(
      screen.getByText((_, el) => el?.className === "pi-label" && el.textContent === "Import ssh config"),
    ).toBeTruthy();
    expect(screen.queryByText("Open settings")).toBeNull();
  });

  it("shows an empty state when nothing matches", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "zzz-no-match" } });
    expect(screen.getByText("No matches")).toBeTruthy();
  });
});

describe("Palette keyboard interaction", () => {
  it("Enter connects to the first host by default", () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onConnect).toHaveBeenCalledWith("web");
  });

  it("arrow keys move the selection and clamp at both ends", () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: "ArrowUp" }); // clamped at 0
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onConnect).toHaveBeenCalledWith("db");

    // 3 hosts + 3 actions = 6 items; spam past the end → last action
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onSettings).toHaveBeenCalled();
  });

  it("Enter runs the selected action when only actions match", () => {
    const { props, input } = setup();
    fireEvent.change(input, { target: { value: "new conn" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onNew).toHaveBeenCalled();
    expect(props.onConnect).not.toHaveBeenCalled();
  });

  it("selection resets to the top when the query changes", () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.change(input, { target: { value: "web" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onConnect).toHaveBeenCalledWith("web");
  });

  it("Tab edits the selected host but not actions", () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(props.onEdit).toHaveBeenCalledWith("web");

    props.onEdit.mockClear();
    fireEvent.change(input, { target: { value: "settings" } });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("Escape closes the palette", () => {
    const { props, input } = setup();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("Enter on an empty list does nothing", () => {
    const { props, input } = setup([]);
    fireEvent.change(input, { target: { value: "zzz" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(props.onConnect).not.toHaveBeenCalled();
    expect(props.onNew).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
});

describe("Palette mouse interaction", () => {
  it("clicking a host connects to it", () => {
    const { props } = setup();
    fireEvent.click(screen.getByText("db-primary"));
    expect(props.onConnect).toHaveBeenCalledWith("db");
  });

  it("clicking the scrim closes, clicking inside does not", () => {
    const { props } = setup();
    fireEvent.click(document.querySelector(".scrim")!);
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector(".palette")!);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Palette preview", () => {
  it("shows host details for the selected host", () => {
    setup();
    // preview pane shows the selected (first) host's address
    expect(screen.getAllByText("deploy@web.example.com:22").length).toBeGreaterThan(0);
    expect(screen.getByText("connect to host")).toBeTruthy();
  });

  it("switches scope label when an action is selected", () => {
    const { input } = setup();
    fireEvent.change(input, { target: { value: "settings" } });
    expect(screen.getByText("command")).toBeTruthy();
    expect(screen.getByText("Run an action")).toBeTruthy();
  });
});
