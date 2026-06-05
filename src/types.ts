/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TeacherUnavailability {
  id: string;
  date: string; // YYYY-MM-DD
  time: "09:00" | "14:00" | "all";
}

export interface Teacher {
  id: string;
  name: string;
  subjectGroup: string; // e.g. "500", "300"
  subject: string;      // e.g. "Matemática", "Português"
  role: string;         // e.g. "QA", "Contratado", "Quadro"
  email: string;
  phone?: string;
  available: boolean;   // Check if available for invigilation
  unavailabilities?: TeacherUnavailability[];
}

export interface Room {
  id: string;
  name: string;         // e.g. "Sala 101", "Anfiteatro A"
  capacity: number;     // Student capacity
  floor?: string;
}

export interface Exam {
  id: string;
  name: string;         // e.g. "Matemática A - 12º Ano"
  subject: string;      // Used for compatibility check (e.g. "Matemática")
  date: string;         // YYYY-MM-DD
  time: string;
  roomIds?: string[];   // Associated room IDs for this exam
}

export interface Allocation {
  id: string;
  examId: string;
  roomId: string;
  invigilator1Id: string | null; // Teacher 1
  invigilator2Id: string | null; // Teacher 2
  substituteId: string | null;   // Suplente (reserve)
}

export interface NotificationLog {
  id: string;
  timestamp: string;
  recipientEmail: string;
  recipientName: string;
  title: string;
  message: string;
  sentVia: 'push' | 'email';
  read: boolean;
}

export type Language = 'pt' | 'en';

export type UserRole = 'admin' | 'teacher';

export interface UserSession {
  role: UserRole;
  teacherId?: string; // If logging in as a specific teacher
  email: string;
  name: string;
}
