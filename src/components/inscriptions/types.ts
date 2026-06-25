import type { Course } from '@/actions/courses';

export interface EventsCardProps {
  id: string;
  title: string;
  module: number;
  features: Record<string, string>;
  buttonText: string;
  actionOnClick: () => void;
  clicked?: boolean;
}

export interface WeekSectionProps {
  title: string;
  subtitle: string;
  courses: Course[];
  handleSelectCourse: (course: Course) => void;
  weekNumber: number;
  // Single-select mode (modules): the currently chosen course.
  selectedWeek?: Course | null;
  // Multi-select mode (workshops): the set of chosen course ids.
  selectedIds?: string[];
}
