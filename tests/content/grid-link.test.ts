// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type { CourseSnapshot } from "../../src/adapters/planner-adapter";
import { linkGridBlocks, readBlockLines } from "../../src/content/grid-link";

/**
 * The card shape recorded in `docs/MYUCLA_CONTRACT.md`: the subject and the
 * catalogue number split across two paragraphs, and a nine-column section
 * table whose last row is Plan Actions rather than a meeting.
 */
function card(
  id: string,
  subject: string,
  number: string,
  rows: { section: string; location: string }[]
): CourseSnapshot {
  const node = document.createElement("tbody");
  node.innerHTML = `
    <tr>
      <td class="SubjectAreaName_ClassName">
        <p>Class 1: ${subject}</p>
        <p>${number} - A Course Title</p>
      </td>
    </tr>
    <tr><td colspan="2"><table class="coursetable">
      <tr>
        <th>Change</th><th>Section</th><th>Status</th><th>Info</th><th>Days</th>
        <th>Time</th><th>Location</th><th>Units</th><th>Instructor</th>
      </tr>
      ${rows
        .map(
          (row) => `<tr>
        <td></td><td>${row.section}</td><td>Open: 4 of 100 Left</td><td></td>
        <td>MW</td><td>9am-9:50am</td><td>${row.location}</td><td>4.0</td><td>Someone</td>
      </tr>`
        )
        .join("")}
      <tr><td colspan="9">Plan Actions Remove Class From Plan Enrollment Actions Enroll</td></tr>
    </table></td></tr>`;
  return { id, label: `${subject} ${number}`, node };
}

/** MyUCLA's block: three text runs separated by bare `<br>` elements. */
function block(code: string, section: string, location: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "planneritembox";
  node.innerHTML = `${code}<br class="hide-small"><span class="hide-above-small"> &middot; </span>${section}<br class="hide-small"><span class="hide-above-small"> &middot; </span>${location}`;
  return node;
}

const MGMT_170 = card("c1", "Management", "170", [
  { section: "Lec 1", location: "Entrepreneurs Hall C314" }
]);

describe("readBlockLines", () => {
  it("reads the three runs out of MyUCLA's own markup", () => {
    expect(readBlockLines(block("MGMT 170", "Lec 1", "Entrepreneurs Hall C314"))).toEqual([
      "MGMT 170",
      "Lec 1",
      "Entrepreneurs Hall C314"
    ]);
  });

  it("reads the same three runs once the layout switch has wrapped them", () => {
    const wrapped = document.createElement("div");
    wrapped.className = "planneritembox";
    wrapped.innerHTML =
      '<span class="pl-gridline">MGMT 170</span><br>' +
      '<span class="pl-gridline">Lec 1</span><br>' +
      '<span class="pl-gridline">Entrepreneurs Hall C314</span>';

    expect(readBlockLines(wrapped)).toEqual([
      "MGMT 170",
      "Lec 1",
      "Entrepreneurs Hall C314"
    ]);
  });
});

describe("linkGridBlocks", () => {
  it("matches a block to its card without ever comparing the subject", () => {
    const target = block("MGMT 170", "Lec 1", "Entrepreneurs Hall C314");
    const links = linkGridBlocks([target], [MGMT_170]);

    expect(links).toEqual([{ block: target, courseId: "c1" }]);
  });

  it("matches each section of one class to that same card", () => {
    const two = card("c2", "Mcd Bio", "60", [
      { section: "Lec 3", location: "Entrepreneurs Hall C314" },
      { section: "Dis 3B", location: "Bunche Hall 3153" }
    ]);
    const lecture = block("MCD BIO 60", "Lec 3", "Entrepreneurs Hall C314");
    const discussion = block("MCD BIO 60", "Dis 3B", "Bunche Hall 3153");

    expect(linkGridBlocks([lecture, discussion], [two]).map((link) => link.courseId)).toEqual([
      "c2",
      "c2"
    ]);
  });

  it("leaves a block alone when two classes share the number, section and room", () => {
    const first = card("c1", "Econ", "1", [{ section: "Lec 1", location: "Rolfe 1200" }]);
    const second = card("c2", "Economics", "1", [{ section: "Lec 1", location: "Rolfe 1200" }]);
    const ambiguous = block("ECON 1", "Lec 1", "Rolfe 1200");

    expect(linkGridBlocks([ambiguous], [first, second])).toEqual([]);
  });

  it("still separates two classes that share a number but not a room", () => {
    const first = card("c1", "Ling", "1", [{ section: "Lec 1", location: "Haines Hall 39" }]);
    const second = card("c2", "French", "1", [{ section: "Lec 1", location: "Royce Hall 152" }]);

    expect(
      linkGridBlocks([block("LING 1", "Lec 1", "Haines Hall 39")], [first, second])
    ).toEqual([{ block: expect.anything(), courseId: "c1" }]);
  });

  it("leaves a block alone when no card claims it", () => {
    expect(linkGridBlocks([block("CHEM 14B", "Lec 1", "Young CS24")], [MGMT_170])).toEqual([]);
  });

  it("does not read the Plan Actions row as a meeting", () => {
    // That row is one wide cell, not nine, and it holds the Enroll button.
    const rogue = block("MGMT 170", "Plan Actions Remove Class From Plan", "Enroll");

    expect(linkGridBlocks([rogue], [MGMT_170])).toEqual([]);
  });

  it("ignores a block whose first line carries no catalogue number", () => {
    expect(linkGridBlocks([block("MATH", "Lec 1", "Entrepreneurs Hall C314")], [MGMT_170]))
      .toEqual([]);
  });

  it("ignores a block that does not have three lines", () => {
    const short = document.createElement("div");
    short.textContent = "MGMT 170";

    expect(linkGridBlocks([short], [MGMT_170])).toEqual([]);
  });
});
