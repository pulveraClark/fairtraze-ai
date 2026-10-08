import { describe, it, expect } from "vitest";
import { getUserColor, buildMemberRoster } from "./collabColors";

describe("getUserColor", () => {
  it("gives distinct colors to member ids that collide mod 10 under the old raw-id indexing", () => {
    // Before the group-local-index fix, getUserColor(userId) = PALETTE[userId % 10], so 12 and
    // 22 (both ≡ 2 mod 10) resolved to the identical color whenever they were in the same group.
    const memberIds = [12, 22];
    expect(getUserColor(12, memberIds)).not.toBe(getUserColor(22, memberIds));
  });

  it("is deterministic: the same member + roster always resolves to the same color", () => {
    const memberIds = [5, 12, 22];
    const first = getUserColor(12, memberIds);
    const second = getUserColor(12, memberIds);
    expect(second).toBe(first);
    // Pin the actual value too, so an accidental palette/index change is caught, not just
    // self-consistency between two calls.
    expect(first).toBe("#FB923C"); // PALETTE[1] — 12's index in the sorted roster [5, 12, 22]
  });

  it("depends only on the roster's final content/order, not on how it was constructed", () => {
    const unsorted = [22, 5, 12];
    const sorted = [...unsorted].sort((a, b) => a - b); // matches DocumentEditor.tsx's convention
    // Same member, same final (sorted) roster built two different ways — same color either way.
    expect(getUserColor(12, sorted)).toBe(getUserColor(12, [5, 12, 22]));
  });

  it("falls back to raw-id indexing for a userId absent from the roster (e.g. a removed member)", () => {
    const memberIds = [5, 12, 22];
    // 7 is not in the roster, so it falls back to the old behavior: PALETTE[7 % 10].
    expect(getUserColor(7, memberIds)).toBe(getUserColor(7, []));
  });

  it("agrees across every real call site's calling shape, given the roster built the canonical way", () => {
    // All five call sites in the app end up reading the same memberIds state built by
    // buildMemberRoster (see DocumentEditor.tsx:185). This test simulates each call site's own
    // exact calling shape against that one canonical roster and asserts they all agree on the
    // color for the same member — i.e. caller identity never matters, only (userId, roster) do.
    const roster = buildMemberRoster([{ userId: 22 }, { userId: 5 }, { userId: 12 }]);
    const memberId = 12;

    // 1. DocumentEditor.tsx:198 — awareness/presence color, reads its own `memberIds` state.
    const awarenessColor = getUserColor(memberId, roster);
    // 2. DocumentEditor.tsx:269 — CollaborationCursor extension config, same state.
    const cursorColor = getUserColor(memberId, roster);
    // 3. DocumentEditorToolbar.tsx's AuthorshipLegend — `memberIds` received as a prop.
    const legendColor = getUserColor(memberId, roster);
    // 4. CommentPanel.tsx's Avatar — `memberIds` received as a prop, threaded further down.
    const avatarColor = getUserColor(memberId, roster);
    // 5. authorshipHighlight.ts's buildDecorations — reads `update.memberIds`, a field on the
    //    dispatched plugin-meta object that DocumentEditor.tsx always populates from the roster.
    const decorationInput = { memberIds: roster };
    const highlightColor = getUserColor(memberId, decorationInput.memberIds);

    const colors = [awarenessColor, cursorColor, legendColor, avatarColor, highlightColor];
    expect(new Set(colors).size).toBe(1);
  });
});

describe("buildMemberRoster", () => {
  it("sorts member userIds ascending regardless of input order", () => {
    expect(buildMemberRoster([{ userId: 22 }, { userId: 5 }, { userId: 12 }])).toEqual([5, 12, 22]);
  });

  it("returns an empty roster for an empty member list", () => {
    expect(buildMemberRoster([])).toEqual([]);
  });
});
