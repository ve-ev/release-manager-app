export interface AppSettings {
  customFieldNames: string[];
  greenZoneValues: string[];
  yellowZoneValues: string[];
  redZoneValues: string[];
  greenColor?: string;
  yellowColor?: string;
  redColor?: string;
  greyColor?: string;
  products?: Array<{ id: string; name: string; color?: string }>
}
