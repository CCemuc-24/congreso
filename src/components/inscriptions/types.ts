import type { Course } from '@/actions/courses';

export interface EventsCardProps {
  id: string;
  title: string;
  features: Record<string, string>;
  // Label for the actionable (unselected) state — always phrased as an action.
  buttonText: string;
  // Label while selected; says out loud that clicking again removes the pick.
  selectedText?: string;
  // Badge on the selected card, so the choice reads at a glance while scrolling.
  badge?: string;
  // Informational line under the title (e.g. "20 cupos disponibles").
  meta?: string;
  actionOnClick: () => void;
  clicked?: boolean;
  // Recessed look: another option holds the slot, or the pick limit is reached.
  dimmed?: boolean;
  // Pick limit reached and this card is not part of the selection: the button
  // is really disabled instead of silently ignoring the click.
  locked?: boolean;
}

export interface WeekSectionProps {
  title: string;
  subtitle: string;
  // One-line explanation of the selection rule, under the heading.
  hint?: string;
  courses: Course[];
  handleSelectCourse: (course: Course) => void;
  weekNumber: number;
  // Single-select mode (modules): the currently chosen course.
  selectedWeek?: Course | null;
  // Multi-select mode (workshops): the set of chosen course ids.
  selectedIds?: string[];
  // Multi-select mode: how many picks are allowed. Reaching it locks the rest.
  limit?: number;
}
