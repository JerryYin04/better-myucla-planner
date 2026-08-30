/**
 * Clicking a meeting in MyUCLA's weekly grid takes you to that class in the
 * plan below it.
 *
 * The grid says when, the list says everything else, and nothing joins them:
 * finding the class you just spotted on Tuesday morning means scrolling a list
 * of seventeen looking for a name the grid never spelled out.
 *
 * The join is the hard part. The grid abbreviates the subject and the card
 * spells it out — `MGMT 170` against `Management 170` — so the subject
 * cannot be compared, and a table of abbreviations would be a claim about the
 * university that this page cannot check. Three things are written identically
 * on both sides, and all three have to agree:
 *
 *     catalogue number   170
 *     section            Lec 1
 *     location           Entrepreneurs Hall C314
 *
 * A block that matches two cards, or none, is left exactly as MyUCLA drew it. A
 * wrong link here sends a student to the wrong class during enrolment week,
 * which is worse than no link at all.
 *
 * Read-only. This reads text MyUCLA already rendered and scrolls. It never
 * touches the Plan Actions row, which is where the Enroll button lives.
 */

import type { CourseSnapshot } from "../adapters/planner-adapter";
import { readHeadline } from "./page-polish";

/** One meeting row from a card's nine-column section table. */
interface CardMeeting {
  courseId: string;
  number: string;
  section: string;
  location: string;
}

export interface GridBlockLink {
  block: HTMLElement;
  courseId: string;
}

const LABEL_SELECTOR = "td.SubjectAreaName_ClassName";
const SECTION_COLUMN = 1;
const LOCATION_COLUMN = 6;
const EXPECTED_COLUMNS = 9;

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The same fold on both sides, and nothing looser than case. */
function key(number: string, section: string, location: string): string {
  return [number, section, location].map((part) => normalize(part).toLowerCase()).join(" ");
}

/**
 * The three lines MyUCLA writes into a block: course code, section, location.
 *
 * They are bare text nodes separated by `<br>`, unless the optional layout
 * switch has already wrapped each run in a `.pl-gridline` span. Both shapes
 * have to read the same, or this stops working the moment that switch is on.
 */
export function readBlockLines(block: HTMLElement): string[] {
  const wrapped = [...block.querySelectorAll<HTMLElement>(":scope > .pl-gridline")];
  if (wrapped.length > 0) {
    return wrapped.map((line) => normalize(line.textContent || "")).filter(Boolean);
  }
  return [...block.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => normalize(node.textContent || ""))
    .filter(Boolean);
}

/**
 * Every meeting row on every card. The header row and the Plan Actions row are
 * both skipped: only rows of exactly nine cells are read, which is the shape
 * recorded in `docs/MYUCLA_CONTRACT.md`.
 */
export function readCardMeetings(courses: CourseSnapshot[]): CardMeeting[] {
  const meetings: CardMeeting[] = [];
  courses.forEach((course) => {
    const labelHost = course.node.querySelector<HTMLElement>(LABEL_SELECTOR);
    const headline = labelHost ? readHeadline(labelHost) : null;
    if (!headline) return;

    course.node.querySelectorAll<HTMLTableElement>("table.coursetable").forEach((table) => {
      [...table.rows].forEach((row) => {
        const cells = [...row.cells];
        if (cells.length !== EXPECTED_COLUMNS) return;
        if (cells.every((cell) => cell.tagName === "TH")) return;
        const section = normalize(cells[SECTION_COLUMN].textContent || "");
        const location = normalize(cells[LOCATION_COLUMN].textContent || "");
        if (!section || !location) return;
        meetings.push({ courseId: course.id, number: headline.number, section, location });
      });
    });
  });
  return meetings;
}

/**
 * Pairs each grid block with the one card it can only be. Blocks that are
 * ambiguous, unreadable, or match nothing are simply absent from the result.
 */
export function linkGridBlocks(
  blocks: HTMLElement[],
  courses: CourseSnapshot[]
): GridBlockLink[] {
  const byKey = new Map<string, Set<string>>();
  readCardMeetings(courses).forEach((meeting) => {
    const id = key(meeting.number, meeting.section, meeting.location);
    const owners = byKey.get(id) || new Set<string>();
    owners.add(meeting.courseId);
    byKey.set(id, owners);
  });

  const links: GridBlockLink[] = [];
  blocks.forEach((block) => {
    const lines = readBlockLines(block);
    if (lines.length < 3) return;

    // `MGMT 170` becomes `170`. Whatever came before it is the abbreviated
    // subject and is never compared, because the card spells that out.
    const code = lines[0];
    const cut = code.lastIndexOf(" ");
    if (cut < 1) return;
    const number = code.slice(cut + 1);
    if (!number) return;

    const owners = byKey.get(key(number, lines[1], lines[2]));
    if (!owners || owners.size !== 1) return;
    links.push({ block, courseId: [...owners][0] });
  });
  return links;
}
