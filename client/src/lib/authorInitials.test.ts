import { describe, it, expect } from "vitest";
import { authorInitials } from "./collabColors";

describe("authorInitials", () => {
  it("uses the first letter of the first and last name, uppercase", () => {
    expect(authorInitials(["Ana Reyes"])).toEqual(["AR"]);
    expect(authorInitials(["juan dela cruz"])).toEqual(["JC"]);
  });

  it("uses the first two letters of a single name", () => {
    expect(authorInitials(["Ana"])).toEqual(["AN"]);
    expect(authorInitials(["x"])).toEqual(["X"]);
  });

  it("gives a later member with the same initials the first two letters of their first name", () => {
    expect(authorInitials(["Ana Reyes", "Alan Rivera", "Ben Cruz"])).toEqual(["AR", "AL", "BC"]);
  });

  it("ignores extra spaces", () => {
    expect(authorInitials(["  ana   reyes  "])).toEqual(["AR"]);
    expect(authorInitials(["   "])).toEqual(["?"]);
  });

  it("never splits an emoji or other multi-unit character", () => {
    expect(authorInitials(["😀 Ana"])).toEqual(["😀A"]);
    expect(authorInitials(["Émile Zola"])).toEqual(["ÉZ"]);
    expect(authorInitials(["😀😀"])).toEqual(["😀😀"]);
  });
});
