export type Officer = {
  id: number;
  name: string;
  email: string;
  role: string;
  branch?: string;
  active: boolean;
};

export const officers: Officer[] = [
  {
    id: 1,
    name: "John Doe",
    email: "john.doe@example.com",
    role: "President",
    active: true,
  },
  {
    id: 2,
    name: "Jane Smith",
    email: "jane.smith@example.com",
    role: "Vice President",
    branch: "Intro Academic Officer",
    active: true,
  },
  {
    id: 3,
    name: "Alice Johnson",
    email: "alice.johnson@example.com",
    role: "Secretary",
    active: false,
  },
];
