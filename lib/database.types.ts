export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      application_config: {
        Row: {
          id: number;
          participation_points_per_hour: number;
          updated_at: string;
        };
        Insert: {
          id?: number;
          participation_points_per_hour: number;
          updated_at?: string;
        };
        Update: {
          id?: number;
          participation_points_per_hour?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          actor_officer_id: number | null;
          created_at: string;
          details: NonNullable<Json>;
          entity_id: string;
          entity_type: string;
          id: number;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          actor_officer_id?: number | null;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id: string;
          entity_type: string;
          id?: number;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          actor_officer_id?: number | null;
          created_at?: string;
          details?: NonNullable<Json>;
          entity_id?: string;
          entity_type?: string;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_officer_id_fkey";
            columns: ["actor_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_actor_officer_id_fkey";
            columns: ["actor_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: {
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      event_branches: {
        Row: {
          branch_id: number;
          event_id: number;
        };
        Insert: {
          branch_id: number;
          event_id: number;
        };
        Update: {
          branch_id?: number;
          event_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_branches_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      event_locations: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          normalized_name: string | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          normalized_name?: never;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          normalized_name?: never;
        };
        Relationships: [];
      };
      event_officers: {
        Row: {
          event_id: number;
          officer_id: number;
        };
        Insert: {
          event_id: number;
          officer_id: number;
        };
        Update: {
          event_id?: number;
          officer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "event_officers_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_officers_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_officers_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      event_series: {
        Row: {
          created_at: string;
          created_by: number;
          ends_on: string | null;
          id: number;
          parent_series_id: number | null;
          recurrence_rule: string;
          request_key: string;
          retired: boolean;
          revision: number;
          starts_on: string | null;
          time_zone: string;
        };
        Insert: {
          created_at?: string;
          created_by: number;
          ends_on?: string | null;
          id?: number;
          parent_series_id?: number | null;
          recurrence_rule: string;
          request_key: string;
          retired?: boolean;
          revision?: number;
          starts_on?: string | null;
          time_zone?: string;
        };
        Update: {
          created_at?: string;
          created_by?: number;
          ends_on?: string | null;
          id?: number;
          parent_series_id?: number | null;
          recurrence_rule?: string;
          request_key?: string;
          retired?: boolean;
          revision?: number;
          starts_on?: string | null;
          time_zone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "event_series_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_series_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "event_series_parent_series_id_fkey";
            columns: ["parent_series_id"];
            isOneToOne: false;
            referencedRelation: "event_series";
            referencedColumns: ["id"];
          },
        ];
      };
      event_types: {
        Row: {
          available_for_new_events: boolean;
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          available_for_new_events?: boolean;
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          available_for_new_events?: boolean;
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      events: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          deleted_by_officer_id: number | null;
          description: string;
          ends_at: string;
          event_date: string;
          event_type_id: number;
          id: number;
          location: string | null;
          location_id: number | null;
          meeting_notes_url: string | null;
          name: string;
          participation_points_per_hour_at_end: number | null;
          recurrence_key: string | null;
          recurrence_series_id: number | null;
          slides_url: string | null;
          starts_at: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_by_officer_id?: number | null;
          description?: string;
          ends_at: string;
          event_date: string;
          event_type_id: number;
          id?: number;
          location?: string | null;
          location_id?: number | null;
          meeting_notes_url?: string | null;
          name: string;
          participation_points_per_hour_at_end?: number | null;
          recurrence_key?: string | null;
          recurrence_series_id?: number | null;
          slides_url?: string | null;
          starts_at: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          deleted_by_officer_id?: number | null;
          description?: string;
          ends_at?: string;
          event_date?: string;
          event_type_id?: number;
          id?: number;
          location?: string | null;
          location_id?: number | null;
          meeting_notes_url?: string | null;
          name?: string;
          participation_points_per_hour_at_end?: number | null;
          recurrence_key?: string | null;
          recurrence_series_id?: number | null;
          slides_url?: string | null;
          starts_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_deleted_by_officer_id_fkey";
            columns: ["deleted_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_deleted_by_officer_id_fkey";
            columns: ["deleted_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_event_type_id_fkey";
            columns: ["event_type_id"];
            isOneToOne: false;
            referencedRelation: "event_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "event_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "events_recurrence_series_id_fkey";
            columns: ["recurrence_series_id"];
            isOneToOne: false;
            referencedRelation: "event_series";
            referencedColumns: ["id"];
          },
        ];
      };
      officer_branches: {
        Row: {
          branch_id: number;
          officer_id: number;
        };
        Insert: {
          branch_id: number;
          officer_id: number;
        };
        Update: {
          branch_id?: number;
          officer_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "officer_branches_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "officer_branches_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "officer_branches_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      officer_warnings: {
        Row: {
          created_at: string;
          id: number;
          officer_id: number;
          reason: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          officer_id: number;
          reason: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          officer_id?: number;
          reason?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "officer_warnings_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "officer_warnings_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      officers: {
        Row: {
          application_role: string;
          auth_user_id: string | null;
          classification: string | null;
          created_at: string;
          id: number;
          name: string;
          personal_email: string | null;
          position_id: number;
          status: string;
          utep_email: string | null;
        };
        Insert: {
          application_role?: string;
          auth_user_id?: string | null;
          classification?: string | null;
          created_at?: string;
          id?: number;
          name: string;
          personal_email?: string | null;
          position_id: number;
          status?: string;
          utep_email?: string | null;
        };
        Update: {
          application_role?: string;
          auth_user_id?: string | null;
          classification?: string | null;
          created_at?: string;
          id?: number;
          name?: string;
          personal_email?: string | null;
          position_id?: number;
          status?: string;
          utep_email?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "officers_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      point_transactions: {
        Row: {
          award_type: string;
          created_at: string;
          created_by: string | null;
          created_by_officer_id: number | null;
          event_id: number | null;
          id: number;
          officer_id: number;
          points: number;
          reason: string;
          removed_at: string | null;
          removed_by: string | null;
          removed_by_officer_id: number | null;
          task_id: number | null;
          updated_at: string | null;
          updated_by: string | null;
          updated_by_officer_id: number | null;
        };
        Insert: {
          award_type: string;
          created_at?: string;
          created_by?: string | null;
          created_by_officer_id?: number | null;
          event_id?: number | null;
          id?: number;
          officer_id: number;
          points: number;
          reason: string;
          removed_at?: string | null;
          removed_by?: string | null;
          removed_by_officer_id?: number | null;
          task_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          updated_by_officer_id?: number | null;
        };
        Update: {
          award_type?: string;
          created_at?: string;
          created_by?: string | null;
          created_by_officer_id?: number | null;
          event_id?: number | null;
          id?: number;
          officer_id?: number;
          points?: number;
          reason?: string;
          removed_at?: string | null;
          removed_by?: string | null;
          removed_by_officer_id?: number | null;
          task_id?: number | null;
          updated_at?: string | null;
          updated_by?: string | null;
          updated_by_officer_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "point_transactions_created_by_officer_id_fkey";
            columns: ["created_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_created_by_officer_id_fkey";
            columns: ["created_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_removed_by_officer_id_fkey";
            columns: ["removed_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_removed_by_officer_id_fkey";
            columns: ["removed_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_updated_by_officer_id_fkey";
            columns: ["updated_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_updated_by_officer_id_fkey";
            columns: ["updated_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      positions: {
        Row: {
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      task_assignments: {
        Row: {
          approved_at: string | null;
          approved_by: number | null;
          assigned_at: string;
          assigned_by: number;
          completed_at: string | null;
          officer_id: number;
          task_id: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: number | null;
          assigned_at?: string;
          assigned_by: number;
          completed_at?: string | null;
          officer_id: number;
          task_id: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: number | null;
          assigned_at?: string;
          assigned_by?: number;
          completed_at?: string | null;
          officer_id?: number;
          task_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "task_assignments_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: true;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_officer_assignments: {
        Row: {
          approved_at: string | null;
          approved_by: number | null;
          assigned_at: string;
          assigned_by: number;
          completed_at: string | null;
          officer_id: number;
          task_id: number;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: number | null;
          assigned_at?: string;
          assigned_by: number;
          completed_at?: string | null;
          officer_id: number;
          task_id: number;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: number | null;
          assigned_at?: string;
          assigned_by?: number;
          completed_at?: string | null;
          officer_id?: number;
          task_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "task_officer_assignments_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_assigned_by_fkey";
            columns: ["assigned_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_officer_assignments_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      task_series: {
        Row: {
          created_at: string;
          created_by: number;
          ends_on: string | null;
          id: number;
          parent_series_id: number | null;
          recurrence_rule: string;
          request_key: string;
          retired: boolean;
          revision: number;
          starts_on: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: number;
          ends_on?: string | null;
          id?: number;
          parent_series_id?: number | null;
          recurrence_rule: string;
          request_key: string;
          retired?: boolean;
          revision?: number;
          starts_on?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: number;
          ends_on?: string | null;
          id?: number;
          parent_series_id?: number | null;
          recurrence_rule?: string;
          request_key?: string;
          retired?: boolean;
          revision?: number;
          starts_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "task_series_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_series_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_series_parent_series_id_fkey";
            columns: ["parent_series_id"];
            isOneToOne: false;
            referencedRelation: "task_series";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          approval_required: boolean;
          branch_id: number;
          created_at: string;
          created_by: number;
          description: string;
          due_date: string;
          id: number;
          points: number;
          recurrence_key: string | null;
          recurrence_series_id: number | null;
          removed_at: string | null;
          removed_by: number | null;
          task_type: string;
          title: string;
        };
        Insert: {
          approval_required?: boolean;
          branch_id: number;
          created_at?: string;
          created_by: number;
          description: string;
          due_date: string;
          id?: number;
          points: number;
          recurrence_key?: string | null;
          recurrence_series_id?: number | null;
          removed_at?: string | null;
          removed_by?: number | null;
          task_type: string;
          title: string;
        };
        Update: {
          approval_required?: boolean;
          branch_id?: number;
          created_at?: string;
          created_by?: number;
          description?: string;
          due_date?: string;
          id?: number;
          points?: number;
          recurrence_key?: string | null;
          recurrence_series_id?: number | null;
          removed_at?: string | null;
          removed_by?: number | null;
          task_type?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_recurrence_series_id_fkey";
            columns: ["recurrence_series_id"];
            isOneToOne: false;
            referencedRelation: "task_series";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_removed_by_fkey";
            columns: ["removed_by"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
      warning_approvals: {
        Row: {
          approver_id: string;
          approver_officer_id: number | null;
          approver_role: string;
          decided_at: string | null;
          decision: string;
          warning_id: number;
        };
        Insert: {
          approver_id: string;
          approver_officer_id?: number | null;
          approver_role: string;
          decided_at?: string | null;
          decision?: string;
          warning_id: number;
        };
        Update: {
          approver_id?: string;
          approver_officer_id?: number | null;
          approver_role?: string;
          decided_at?: string | null;
          decision?: string;
          warning_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "warning_approvals_approver_officer_id_fkey";
            columns: ["approver_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warning_approvals_approver_officer_id_fkey";
            columns: ["approver_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "warning_approvals_warning_id_fkey";
            columns: ["warning_id"];
            isOneToOne: false;
            referencedRelation: "officer_warnings";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      dashboard_summary: {
        Row: {
          active_officer_count: number | null;
          half_year_points: number | null;
          upcoming_event_count: number | null;
        };
        Relationships: [];
      };
      officer_point_totals: {
        Row: {
          id: number | null;
          name: string | null;
          total_points: number | null;
        };
        Relationships: [];
      };
      point_history: {
        Row: {
          activity_date: string | null;
          award_type: string | null;
          created_at: string | null;
          created_by: string | null;
          created_by_name: string | null;
          created_by_officer_id: number | null;
          event_date: string | null;
          event_id: number | null;
          event_name: string | null;
          id: number | null;
          officer_id: number | null;
          officer_name: string | null;
          points: number | null;
          reason: string | null;
          removed_at: string | null;
          removed_by: string | null;
          removed_by_name: string | null;
          removed_by_officer_id: number | null;
          search_text: string | null;
          task_id: number | null;
          task_title: string | null;
          updated_at: string | null;
          updated_by: string | null;
          updated_by_name: string | null;
          updated_by_officer_id: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "point_transactions_created_by_officer_id_fkey";
            columns: ["created_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_created_by_officer_id_fkey";
            columns: ["created_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_officer_id_fkey";
            columns: ["officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_removed_by_officer_id_fkey";
            columns: ["removed_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_removed_by_officer_id_fkey";
            columns: ["removed_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_task_id_fkey";
            columns: ["task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_updated_by_officer_id_fkey";
            columns: ["updated_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officer_point_totals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_transactions_updated_by_officer_id_fkey";
            columns: ["updated_by_officer_id"];
            isOneToOne: false;
            referencedRelation: "officers";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      add_manual_transaction: {
        Args: {
          p_award_type: string;
          p_event_id?: number;
          p_officer_id: number;
          p_points: number;
          p_reason: string;
        };
        Returns: undefined;
      };
      approve_task: { Args: { p_task_id: number }; Returns: undefined };
      assign_task: {
        Args: { p_officer_id: number; p_task_id: number };
        Returns: undefined;
      };
      bulk_add_event_officers: {
        Args: { p_event_id: number; p_officer_ids: number[] };
        Returns: Json;
      };
      bulk_assign_task_officers: {
        Args: { p_officer_ids: number[]; p_task_id: number };
        Returns: Json;
      };
      cancel_event: { Args: { p_event_id: number }; Returns: undefined };
      change_event_signup: {
        Args: { p_event_id: number; p_officer_id: number; p_remove?: boolean };
        Returns: undefined;
      };
      claim_current_officer_identity: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      complete_task: { Args: { p_task_id: number }; Returns: undefined };
      create_branch: { Args: { p_name: string }; Returns: number };
      create_event_location: { Args: { p_name: string }; Returns: number };
      create_event_type: { Args: { p_name: string }; Returns: number };
      create_position: { Args: { p_name: string }; Returns: number };
      create_recurring_event: {
        Args: {
          p_branch_ids: number[];
          p_description: string;
          p_ends_at: string[];
          p_event_dates: string[];
          p_event_type_id: number;
          p_location: string;
          p_meeting_notes_url: string;
          p_name: string;
          p_recurrence_rule: string;
          p_request_key: string;
          p_slides_url: string;
          p_starts_at: string[];
        };
        Returns: number;
      };
      create_recurring_task: {
        Args: {
          p_approval_required: boolean;
          p_branch_id: number;
          p_description: string;
          p_due_dates: string[];
          p_points: number;
          p_recurrence_rule: string;
          p_request_key: string;
          p_task_type: string;
          p_title: string;
        };
        Returns: number;
      };
      create_warning: {
        Args: { p_officer_id: number; p_reason: string };
        Returns: number;
      };
      decide_warning: {
        Args: { p_decision: string; p_warning_id: number };
        Returns: undefined;
      };
      delete_branch: { Args: { p_id: number }; Returns: undefined };
      delete_event_location: { Args: { p_id: number }; Returns: undefined };
      delete_event_type: { Args: { p_id: number }; Returns: undefined };
      delete_position: { Args: { p_id: number }; Returns: undefined };
      delete_warning: { Args: { p_warning_id: number }; Returns: undefined };
      mutate_recurring_event: {
        Args: {
          p_dates?: string[];
          p_operation: string;
          p_patch?: Json;
          p_request_key: string;
          p_revision: number;
          p_rule?: string;
          p_scope: string;
          p_selected_id: number;
          p_series_id: number;
        };
        Returns: number;
      };
      mutate_recurring_task: {
        Args: {
          p_dates?: string[];
          p_operation: string;
          p_patch?: Json;
          p_request_key: string;
          p_revision: number;
          p_rule?: string;
          p_scope: string;
          p_selected_id: number;
          p_series_id: number;
        };
        Returns: number;
      };
      remove_event: { Args: { p_event_id: number }; Returns: boolean };
      remove_participation_award: {
        Args: { p_transaction_id: number };
        Returns: boolean;
      };
      remove_point_transaction: {
        Args: { p_transaction_id: number };
        Returns: boolean;
      };
      remove_task: { Args: { p_task_id: number }; Returns: undefined };
      remove_task_assignment: {
        Args: { p_officer_id: number; p_task_id: number };
        Returns: undefined;
      };
      rename_branch: {
        Args: { p_id: number; p_name: string };
        Returns: undefined;
      };
      rename_event_location: {
        Args: { p_id: number; p_name: string };
        Returns: undefined;
      };
      rename_event_type: {
        Args: { p_id: number; p_name: string };
        Returns: undefined;
      };
      rename_position: {
        Args: { p_id: number; p_name: string };
        Returns: undefined;
      };
      restore_event: { Args: { p_event_id: number }; Returns: undefined };
      save_event: {
        Args: {
          p_branch_ids: number[];
          p_description: string;
          p_ends_at: string;
          p_event_id?: number;
          p_event_type_id: number;
          p_location: string;
          p_name: string;
          p_starts_at: string;
        };
        Returns: number;
      };
      save_event_with_links: {
        Args: {
          p_branch_ids: number[];
          p_description: string;
          p_ends_at: string;
          p_event_date: string;
          p_event_id?: number;
          p_event_type_id: number;
          p_location: string;
          p_meeting_notes_url?: string;
          p_name: string;
          p_slides_url?: string;
          p_starts_at: string;
        };
        Returns: number;
      };
      save_officer: {
        Args: {
          p_branch_ids: number[];
          p_classification?: string;
          p_name: string;
          p_officer_id?: number;
          p_personal_email?: string;
          p_position_id: number;
          p_status: string;
          p_utep_email?: string;
        };
        Returns: number;
      };
      save_task: {
        Args: {
          p_approval_required: boolean;
          p_branch_id: number;
          p_description: string;
          p_due_date: string;
          p_points: number;
          p_task_type: string;
          p_title: string;
        };
        Returns: number;
      };
      self_assign_task: { Args: { p_task_id: number }; Returns: undefined };
      set_officer_application_role: {
        Args: { p_officer_id: number; p_role: string };
        Returns: undefined;
      };
      set_participation_rate: { Args: { p_rate: number }; Returns: undefined };
      set_task_assignment_completion: {
        Args: { p_completed: boolean; p_officer_id: number; p_task_id: number };
        Returns: undefined;
      };
      update_point_transaction: {
        Args: { p_points: number; p_transaction_id: number };
        Returns: undefined;
      };
      update_task_details: {
        Args: {
          p_branch_id: number;
          p_description: string;
          p_due_date: string;
          p_points: number;
          p_task_id: number;
          p_task_type: string;
          p_title: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
