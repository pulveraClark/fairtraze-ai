import { describe, it, expect } from "vitest";
import { activeMentionQuery, matchMembers, mentionsToPlain, parseMentions } from "./mentions";
import { displayFromStored, storedFromDisplay } from "../../components/tasks/details/MentionTextarea";

const members = [
  { userId: 1, name: "Leader Lee" },
  { userId: 2, name: "Ben Cruz" },
  { userId: 3, name: "Ana Reyes" },
  { userId: 4, name: "Ana" },
];

describe("parseMentions", () => {
  it("renders <@id> tokens live with the current member name", () => {
    expect(parseMentions("Hi <@2>, see <@3>!", members)).toEqual([
      { type: "text", text: "Hi " },
      { type: "mention", userId: 2, name: "Ben Cruz", known: true },
      { type: "text", text: ", see " },
      { type: "mention", userId: 3, name: "Ana Reyes", known: true },
      { type: "text", text: "!" },
    ]);
  });

  it("shows 'a former member' for someone who is no longer in the group", () => {
    const parts = parseMentions("cc <@99>", members);
    expect(parts[1]).toEqual({ type: "mention", userId: 99, name: "a former member", known: false });
    expect(mentionsToPlain("cc <@99> and <@1>", members)).toBe("cc a former member and @Leader Lee");
  });

  it("leaves text without tokens alone", () => {
    expect(parseMentions("plain < @2 > text", members)).toEqual([{ type: "text", text: "plain < @2 > text" }]);
  });
});

describe("display and stored text", () => {
  it("shows @Name while editing and stores the token", () => {
    expect(displayFromStored("Ask <@2> and <@4> now", members)).toBe("Ask @Ben Cruz and @Ana now");
    expect(storedFromDisplay("Ask @Ben Cruz and @Ana now", members)).toBe("Ask <@2> and <@4> now");
  });

  it("matches the longest name first, so 'Ana Reyes' is not read as 'Ana'", () => {
    expect(storedFromDisplay("@Ana Reyes and @Ana", members)).toBe("<@3> and <@4>");
  });

  it("does not turn part of a longer word into a mention", () => {
    expect(storedFromDisplay("@Anabel is not a member", members)).toBe("@Anabel is not a member");
  });

  it("turns a former member's token into plain text so an edit is never rejected", () => {
    expect(displayFromStored("cc <@99>", members)).toBe("cc a former member");
  });

  it("escapes characters in names that are special in patterns", () => {
    const odd = [{ userId: 7, name: "J. (JD) Neil" }];
    expect(storedFromDisplay("hi @J. (JD) Neil!", odd)).toBe("hi <@7>!");
  });
});

describe("autocomplete helpers", () => {
  it("opens a query after an @ at the start or after whitespace", () => {
    expect(activeMentionQuery("@be", 3)).toEqual({ start: 0, query: "be" });
    expect(activeMentionQuery("hello @", 7)).toEqual({ start: 6, query: "" });
    expect(activeMentionQuery("a\n@x", 4)).toEqual({ start: 2, query: "x" });
  });

  it("does not open for an email address, plain text, or across a line break", () => {
    expect(activeMentionQuery("me@host", 7)).toBeNull();
    expect(activeMentionQuery("no mention here", 5)).toBeNull();
    expect(activeMentionQuery("@a\nb", 4)).toBeNull();
  });

  it("matches group members only, prefix matches first, up to the limit", () => {
    expect(matchMembers(members, "an").map((m) => m.name)).toEqual(["Ana", "Ana Reyes"]);
    expect(matchMembers(members, "").length).toBe(4);
    expect(matchMembers(members, "zz")).toEqual([]);
    expect(matchMembers(members, "", 2)).toHaveLength(2);
  });
});
