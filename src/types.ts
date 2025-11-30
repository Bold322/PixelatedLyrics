export interface TranscriptItem {
  text: string[];
  offset: number; // in milliseconds
  duration: number; // in milliseconds
}

export interface VideoConfig {
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontFamily: string;
}

