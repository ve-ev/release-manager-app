export interface CalendarEvent {
  date: Date;
  type: 'freeze' | 'release';
  releaseId: string;
  version: string;
  projectId: string;
  projectName: string;
  status: string;
  product?: string;
}

export interface CalendarReleaseItem {
  id: string;
  version: string;
  featureFreezeDate: string | null;
  releaseDate: string;
  status: string;
  product?: string;
}

export interface ProjectReleases {
  projectId: string;
  projectName: string;
  releases: CalendarReleaseItem[];
}

export interface CalendarConfig {
  projectIds: string[];
  defaultView: 'month' | 'quarter' | 'year';
  showFreezeDates?: boolean;
  showProjectName?: boolean;
  showProduct?: boolean;
}

export interface YouTrackProject {
  id: string;
  shortName: string;
  name: string;
}
