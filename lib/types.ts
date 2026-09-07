export type BookingStatus =
  | "pending_payment"
  | "confirmed"
  | "payment_failed"
  | "cancelled";

export type PaymentStatus = "pending" | "succeeded" | "failed";

export interface Parent {
  id: string;
  name: string;
  email: string;
}

export interface Student {
  id: string;
  parent_id: string;
  name: string;
  age: number;
}

export interface TrialClass {
  id: string;
  title: string;
  subject: string;
  starts_at: string; // ISO
  capacity: number; // always 4 for trial
  teacher_name: string;
}

export interface Booking {
  id: string;
  student_id: string;
  trial_class_id: string;
  parent_id: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
}

export interface PaymentAttempt {
  id: string;
  booking_id: string;
  status: PaymentStatus;
  amount_cents: number;
  provider_ref: string | null;
  created_at: string;
}

// View models
export interface TrialClassWithAvailability extends TrialClass {
  confirmed_count: number;
  available_seats: number;
  is_full: boolean;
}

export interface RosterEntry {
  booking_id: string;
  student: Student;
  parent: Parent;
  booking_status: BookingStatus;
  booked_at: string;
}
