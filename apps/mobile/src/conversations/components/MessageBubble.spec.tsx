import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";

import { fireEvent, getAllHosts, renderMobile } from "../../../test/render";

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
  it("shows the time and one tick on a sent own Message", async () => {
    const screen = await renderMobile(bubble({ status: "sent" }));

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByTestId("message-tick-sent", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId("message-tick-double", { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM, Sent")).toBeTruthy();
  });

  it("shows two ticks for delivered and read, the read ones in another colour", async () => {
    const tickClasses = (screen: Awaited<ReturnType<typeof renderMobile>>) =>
      screen
        .getByTestId("message-tick-double", { includeHiddenElements: true })
        .children.map((child: { props: { className?: string } } | string) =>
          typeof child === "string" ? child : child.props.className,
        );

    const delivered = await renderMobile(bubble({ status: "delivered" }));
    expect(delivered.getByLabelText("Is the car still available?, 02:05 PM, Delivered")).toBeTruthy();
    const deliveredClasses = tickClasses(delivered);
    await delivered.unmount();

    const read = await renderMobile(bubble({ status: "read" }));
    expect(read.getByLabelText("Is the car still available?, 02:05 PM, Read")).toBeTruthy();
    expect(tickClasses(read)).not.toEqual(deliveredClasses);
    expect(tickClasses(read)[0]).toEqual(expect.stringContaining("size-3.5"));
    expect(deliveredClasses[0]).toEqual(expect.stringContaining("size-3.5"));
  });

  it("shows the time without ticks on the other participant's Message", async () => {
    const screen = await renderMobile(bubble({ isMine: false }));

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.queryByTestId(/message-tick/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM")).toBeTruthy();
  });

  it("formats the time in the app language", async () => {
    const screen = await renderMobile(bubble(), { locale: "ru" });
    expect(screen.getByText("14:05")).toBeTruthy();
  });
});

describe("MessageBubble Read label", () => {
  it("shows Read under the bubble when asked to", async () => {
    const screen = await renderMobile(bubble({ status: "read", showReadLabel: true }));
    expect(screen.getByText("Read")).toBeTruthy();
  });

  it("has no Read label otherwise", async () => {
    const screen = await renderMobile(bubble({ status: "read" }));
    expect(screen.queryByText("Read")).toBeNull();
  });
});

describe("MessageBubble sending and failed", () => {
  it("shows Sending... on a pending Message", async () => {
    const screen = await renderMobile(bubble({ status: "pending" }));

    expect(screen.getByText("Sending...")).toBeTruthy();
    expect(screen.queryByTestId(/message-tick/, { includeHiddenElements: true })).toBeNull();
    expect(screen.getByLabelText("Is the car still available?, 02:05 PM, Sending...")).toBeTruthy();
  });

  it("shows Failed to send and a visible Retry with a 44 pt target", async () => {
    const onRetry = vi.fn();
    const screen = await renderMobile(bubble({ status: "failed", onRetry }));

    expect(screen.getByText("Failed to send")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry" });
    expect(screen.getByText("Retry")).toBeTruthy();
    expect(retry.props.style).toMatchObject({ minHeight: 44, minWidth: 44 });
    await fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("MessageBubble kinds keep their look and gain the time", () => {
  it("shows the time on a deleted Message", async () => {
    const screen = await renderMobile(bubble({ deletedAt: AT_1405 }));

    expect(screen.getByText("Message deleted")).toBeTruthy();
    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByLabelText("Message deleted, 02:05 PM")).toBeTruthy();
  });

  it("shows the time on an image Message", async () => {
    const screen = await renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", status: "delivered" }),
    );

    expect(screen.getByText("02:05 PM")).toBeTruthy();
    expect(screen.getByTestId("message-tick-double", { includeHiddenElements: true })).toBeTruthy();
  });

  it("reads the time and state of an own image Message", async () => {
    const screen = await renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", status: "delivered" }),
    );

    expect(screen.getByLabelText("02:05 PM, Delivered").props.accessible).toBe(true);
  });

  it("announces an image Message as a photo", async () => {
    const onImagePress = vi.fn();
    const screen = await renderMobile(
      bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg", onImagePress }),
    );

    await fireEvent.press(screen.getByRole("imagebutton", { name: "Photo" }));
    expect(onImagePress).toHaveBeenCalledOnce();
  });

  it("announces the photo in the app language", async () => {
    const ru = await renderMobile(bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg" }), {
      locale: "ru",
    });
    expect(ru.getByRole("image", { name: "Фото" })).toBeTruthy();
    await ru.unmount();

    const tk = await renderMobile(bubble({ kind: "image", text: "", localImageUri: "file:///photo.jpg" }), {
      locale: "tk",
    });
    expect(tk.getByRole("image", { name: "Surat" })).toBeTruthy();
  });

  it("shows the time on a Listing-reference Message", async () => {
    const screen = await renderMobile(
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

  it("reads the time and state of an own Listing-reference Message", async () => {
    const screen = await renderMobile(
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

  it("reads Reported on a reported text Message", async () => {
    const screen = await renderMobile(bubble({ isMine: false, reported: true }));

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

  it("dims a reported text Message", async () => {
    const screen = await renderMobile(bubble({ isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("dims a reported image Message", async () => {
    const screen = await renderMobile(bubble({ ...IMAGE, isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("dims a reported Listing-reference Message", async () => {
    const screen = await renderMobile(bubble({ ...POST_REF, isMine: false, reported: true }));

    expect(bubbleClassName(screen.getByText("Reported"))).toContain("opacity-60");
  });

  it("does not dim a Message that is not reported", async () => {
    const screen = await renderMobile(bubble({ isMine: false }));

    expect(bubbleClassName(screen.getByText("Is the car still available?"))).not.toMatch(/opacity-/);
  });

  it("does not dim a deleted Message", async () => {
    const screen = await renderMobile(bubble({ isMine: false, reported: true, deletedAt: AT_1405 }));

    expect(bubbleClassName(screen.getByText("Message deleted"))).not.toMatch(/opacity-/);
  });

  it("keeps a pending Message at its own dimming", async () => {
    const screen = await renderMobile(bubble({ status: "pending" }));

    const className = bubbleClassName(screen.getByText("Sending..."));
    expect(className).toContain("opacity-70");
    expect(className).not.toContain("opacity-60");
  });
});


describe("Listing-reference bubble width", () => {
  const listing = {
    listingId: "00000000-0000-4000-8000-0000000000a1",
    brandId: "00000000-0000-4000-8000-0000000000d1",
    modelId: "00000000-0000-4000-8000-0000000000d2",
    year: 2018,
    displayPriceTmt: 285000,
    priceCurrency: "TMT" as const,
    status: "active" as const,
    available: true,
  };
  const postRef = {
    kind: "post_ref" as const,
    text: "",
    metadata: listing,
    postRefBrandName: "Toyota",
    postRefModelName: "Camry with a long model name",
  };
  function container(screen: Awaited<ReturnType<typeof renderMobile>>) {
    return getAllHosts(screen.container, "View").find((node) =>
      node.props.className?.includes("max-w-[80%]"),
    )!;
  }

  it.each([true, false])("bounds a full-width reference and retains its actions, own=%s", async (isMine) => {
    const onPostRefPress = vi.fn();
    const onOpenActions = vi.fn();
    const screen = await renderMobile(bubble({ ...postRef, isMine, onPostRefPress, onOpenActions }));

    // The renderer pins the responsive policy; native screenshots prove Yoga layout.
    expect(container(screen).props.className.split(/\s+/)).toContain("w-full");
    expect(container(screen).props.className).toContain("max-w-[80%]");
    expect(container(screen).props.className).not.toMatch(/(?:^|\s)h-/);
    expect(screen.getByText("2018 Toyota Camry with a long model name")).toBeTruthy();
    expect(screen.getByText("285,000 TMT")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("02:05 PM")).toBeTruthy();
    const card = screen.getByRole("button", { name: /Open: 2018 Toyota Camry/ });
    await fireEvent.press(card);
    expect(onPostRefPress).toHaveBeenCalledWith(listing.listingId);
    await fireEvent(card, "longPress");
    expect(onOpenActions).toHaveBeenCalledOnce();
  });

  it("keeps an unavailable reference bounded and non-tappable", async () => {
    const onPostRefPress = vi.fn();
    const screen = await renderMobile(bubble({
      ...postRef, metadata: { ...listing, status: "sold" }, onPostRefPress,
    }));
    expect(container(screen).props.className.split(/\s+/)).toContain("w-full");
    expect(screen.getByText("Sold")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Open:/ })).toBeNull();
    expect(onPostRefPress).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "text" as const },
    { kind: "image" as const, text: "", localImageUri: "file:///photo.jpg" },
    { ...postRef, deletedAt: AT_1405 },
  ])("preserves intrinsic sizing for ordinary and deleted Messages: $kind", async (props) => {
    const screen = await renderMobile(bubble(props));
    expect(container(screen).props.className.split(/\s+/)).not.toContain("w-full");
    expect(container(screen).props.className).toContain("max-w-[80%]");
  });
});
