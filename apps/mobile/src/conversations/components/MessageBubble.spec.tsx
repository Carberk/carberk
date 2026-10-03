import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, renderMobile } from "../../../test/render";

import { MessageBubble } from "./MessageBubble";

// 14:05 local time, whatever the machine's time zone.
const AT_1405 = new Date(2026, 9, 2, 14, 5).toISOString();

function bubble(props: Partial<ComponentProps<typeof MessageBubble>> = {}) {
  return (
    <MessageBubble
      id="m1"
      text="Is the car still available?"
      isMine
      status="sent"
      createdAt={AT_1405}
      {...props}
    />
  );
}

describe("MessageBubble time and ticks", () => {
  it("shows the time and one tick on a sent own Message", () => {
    const screen = renderMobile(bubble({ status: "sent" }));

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByTestId("message-tick-sent", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("message-tick-double", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM, Sent")).toBeTruthy();
  });

  it("shows two ticks in one style for delivered and read", () => {
    const tickClasses = (screen: ReturnType<typeof renderMobile>) =>
      screen
        .getByTestId("message-tick-double", { includeHiddenElements: true })
        .children.map((child: { props: { className?: string } } | string) =>
          typeof child === "string" ? child : child.props.className,
        );

    const delivered = renderMobile(bubble({ status: "delivered" }));
    expect(delivered.getByLabelText("Is the car still available?, 02:05 PM, Delivered")).toBeTruthy();
    const deliveredClasses = tickClasses(delivered);
    delivered.unmount();

    const read = renderMobile(bubble({ status: "read" }));
    expect(read.getByLabelText("Is the car still available?, 02:05 PM, Read")).toBeTruthy();
    expect(tickClasses(read)).toEqual(deliveredClasses);
    expect(deliveredClasses[0]).toEqual(expect.stringContaining("size-3.5"));
  });

  it("shows the time without ticks on the other participant's Message", () => {
    const screen = renderMobile(bubble({ isMine: false }));

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.queryByTestId(/message-tick/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM")).toBeTruthy();
  });

  it("formats the time in the app language", () => {
    const screen = renderMobile(bubble(), { locale: "ru" });
    expect(screen.getByText("14:05")).toBeTruthy();
  });
});

describe("MessageBubble Read label", () => {
  it("shows Read under the bubble when asked to", () => {
    const screen = renderMobile(bubble({ status: "read", showReadLabel: true }));
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("has no Read label otherwise", () => {
    const screen = renderMobile(bubble({ status: "read" }));
    expect(screen.queryByText("Read")).toBeNull();
  });
});

describe("MessageBubble sending and failed", () => {
  it("shows Sending... on a pending Message", () => {
    const screen = renderMobile(bubble({ status: "pending" }));

    expect(screen.getByText("Sending...")).toBeTruthy();
    expect(screen.queryByTestId(/message-tick/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM, Sending...")).toBeTruthy();
  });

  it("shows Failed to send and a visible Retry with a 44 pt target", () => {
    const onRetry = vi.fn();
    const screen = renderMobile(bubble({ status: "failed", onRetry }));

    expect(screen.getByText("Failed to send")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(retry.props.style).toMatchObject({ minHeight: 44, minWidth: 44 });
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("MessageBubble kinds keep their look and gain the time", () => {
  it("shows the time on a deleted Message", () => {
    const screen = renderMobile(bubble({ deletedAt: AT_1405 }));

    expect(screen.getByText("Message deleted")).toBeTruthy();
    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByLabelText("Message deleted, 02:05 PM")).toBeTruthy();
  });

  it("shows the time on an image Message", () => {
    const screen = renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", status: "delivered" }),
    );

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByTestId("message-tick-double", { includeHiddenElements: true })).toBeTruthy();
  });

  it("reads the time and state of an own image Message", () => {
    const screen = renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", status: "delivered" }),
    );

    expect(screen.getByLabelText("02:05 PM, Delivered").props.accessible).toBe(true);
  });

  it("announces an image Message as a photo", () => {
    const onImagePress = vi.fn();
    const screen = renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", onImagePress }),
    );

    fireEvent.press(screen.getByRole("imagebutton", { name: "Photo" }));
    expect(onImagePress).toHaveBeenCalledOnce();
  });

  it("announces the photo in the app language", () => {
    const ru = renderMobile(bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg" }), {
      locale: "ru",
    });
    expect(ru.getByRole("image", { name: "Фото" })).toBeTruthy();
    ru.unmount();

    const tk = renderMobile(bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg" }), {
      locale: "tk",
    });
    expect(tk.getByRole("image", { name: "Surat" })).toBeTruthy();
  });

  it("shows the time on a Listing-reference Message", () => {
    const screen = renderMobile(
      bubble({
        kind: "post_ref",
        isMine: false,
        text: "",
        metadata: {
          listingId: "00000000-0000-4000-8000-0000000000a1",
          brandId: "00000000-0000-4000-8000-0000000000d1",
          modelId: "00000000-0000-4000-8000-0000000000d2",
          year: 2018,
          displayPriceTmt: 285000,
          priceCurrency: "TMT",
          status: "active",
          available: true,
        },
        postRefBrandName: "Toyota",
        postRefModelName: "Camry",
      }),
    );

    expect(screen.getByText(/Toyota Camry/)).toBeTruthy();
    expect(screen.getByText("02:05 PM")).toBeTruthy();
  });

  it("reads the time and state of an own Listing-reference Message", () => {
    const screen = renderMobile(
      bubble({
        kind: "post_ref",
        text: "",
        status: "read",
        metadata: {
          listingId: "00000000-0000-4000-8000-0000000000a1",
          brandId: "00000000-0000-4000-8000-0000000000d1",
          modelId: "00000000-0000-4000-8000-0000000000d2",
          year: 2018,
          displayPriceTmt: 285000,
          priceCurrency: "TMT",
          status: "active",
          available: true,
        },
        postRefBrandName: "Toyota",
        postRefModelName: "Camry",
      }),
    );

    expect(screen.getByLabelText("02:05 PM, Read").props.accessible).toBe(true);
  });

  it("reads Reported on a reported text Message", () => {
    const screen = renderMobile(bubble({ isMine: false, reported: true }));

    expect(screen.getByLabelText("Is the car still available?, 02:05 PM, Reported")).toBeTruthy();
  });
});

describe("MessageBubble reported dimming", () => {
  const LISTING = {
    listingId: "00000000-0000-4000-8000-0000000000a1",
    brandId: "00000000-0000-4000-8000-0000000000d1",
    modelId: "00000000-0000-4000-8000-0000000000d2",
    year: 2018,
    displayPriceTmt: 285000,
    priceCurrency: "TMT" as const,
    status: "active" as const,
    available: true,
  };
  const IMAGE = { kind: "image" as const, text: "", localImageUri: "file:///photo.jpg" };
  const POST_REF = {
    kind: "post_ref" as const,
    text: "",
    metadata: LISTING,
    postRefBrandName: "Toyota",
    postRefModelName: "Camry",
  };

  /** The class string of the bubble container, found from any node inside it. */
  function bubbleClassName(node: { parent: unknown }): string {
    let current = node as { parent: unknown; props?: { className?: string } } | null;
    while (current) {
      const className = current.props?.className;
      if (typeof className === "string" && className.includes("max-w-[80%]")) return className;
      current = current.parent as typeof current;
    }
    throw new Error("No bubble container above the node");
  }

  it("dims a reported text Message", () => {
    const screen = renderMobile(bubble({ isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("dims a reported image Message", () => {
    const screen = renderMobile(bubble({ ...IMAGE, isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("dims a reported Listing-reference Message", () => {
    const screen = renderMobile(bubble({ ...POST_REF, isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("does not dim a Message that is not reported", () => {
    const screen = renderMobile(bubble({ isMine: false }));

    expect(bubbleClassName(screen.getByText("Is the car still available?"))).not.toMatch(/opacity-/);
  });

  it("does not dim a deleted Message", () => {
    const screen = renderMobile(bubble({ isMine: false, reported: true, deletedAt: AT_1405 }));

    expect(bubbleClassName(screen.getByText("Message deleted"))).not.toMatch(/opacity-/);
  });

  it("keeps a pending Message at its own dimming", () => {
    const screen = renderMobile(bubble({ status: "pending" }));

    const className = bubbleClassName(screen.getByText("Sending..."));
    expect(className).toContain("opacity-70");
    expect(className).not.toContain("opacity-60");
  });
});
