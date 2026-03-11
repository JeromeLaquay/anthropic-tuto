import { test, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MainContent } from "@/app/main-content";

vi.mock("@/lib/contexts/file-system-context", () => ({
  FileSystemProvider: ({ children }: any) => <>{children}</>,
  useFileSystem: vi.fn(),
}));

vi.mock("@/lib/contexts/chat-context", () => ({
  ChatProvider: ({ children }: any) => <>{children}</>,
  useChat: vi.fn(),
}));

vi.mock("@/components/chat/ChatInterface", () => ({
  ChatInterface: () => <div data-testid="chat-interface">Chat</div>,
}));

vi.mock("@/components/preview/PreviewFrame", () => ({
  PreviewFrame: () => <div data-testid="preview-frame">Preview</div>,
}));

vi.mock("@/components/editor/CodeEditor", () => ({
  CodeEditor: () => <div data-testid="code-editor">Code Editor</div>,
}));

vi.mock("@/components/editor/FileTree", () => ({
  FileTree: () => <div data-testid="file-tree">File Tree</div>,
}));

vi.mock("@/components/HeaderActions", () => ({
  HeaderActions: () => <div data-testid="header-actions">Actions</div>,
}));

vi.mock("@/components/ui/resizable", () => ({
  ResizablePanelGroup: ({ children, className }: any) => (
    <div className={className}>{children}</div>
  ),
  ResizablePanel: ({ children }: any) => <div>{children}</div>,
  ResizableHandle: () => <div />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

test("renders preview view by default", () => {
  render(<MainContent />);
  expect(screen.getByTestId("preview-frame")).toBeDefined();
  expect(screen.queryByTestId("code-editor")).toBeNull();
});

test("switches to code view when Code tab is clicked", () => {
  render(<MainContent />);

  fireEvent.click(screen.getByText("Code"));

  expect(screen.queryByTestId("preview-frame")).toBeNull();
  expect(screen.getByTestId("code-editor")).toBeDefined();
  expect(screen.getByTestId("file-tree")).toBeDefined();
});

test("switches back to preview view when Preview tab is clicked", () => {
  render(<MainContent />);

  fireEvent.click(screen.getByText("Code"));
  expect(screen.queryByTestId("preview-frame")).toBeNull();

  fireEvent.click(screen.getByText("Preview"));
  expect(screen.getByTestId("preview-frame")).toBeDefined();
  expect(screen.queryByTestId("code-editor")).toBeNull();
});

test("Preview tab is active by default", () => {
  render(<MainContent />);

  const previewTrigger = screen.getByText("Preview").closest("button");
  const codeTrigger = screen.getByText("Code").closest("button");

  expect(previewTrigger?.getAttribute("data-state")).toBe("active");
  expect(codeTrigger?.getAttribute("data-state")).toBe("inactive");
});

test("Code tab becomes active after clicking it", () => {
  render(<MainContent />);

  fireEvent.click(screen.getByText("Code"));

  const previewTrigger = screen.getByText("Preview").closest("button");
  const codeTrigger = screen.getByText("Code").closest("button");

  expect(previewTrigger?.getAttribute("data-state")).toBe("inactive");
  expect(codeTrigger?.getAttribute("data-state")).toBe("active");
});
