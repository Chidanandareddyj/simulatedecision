import { SeededRng } from "@/lib/synthetic/rng";

const FIRST = [
  "Aarav", "Priya", "Rahul", "Ananya", "Vikram", "Sneha", "Arjun", "Kavya",
  "Rohan", "Meera", "Aditya", "Pooja", "Suresh", "Lakshmi", "Amit", "Neha",
  "Rajesh", "Divya", "Sanjay", "Ritu", "Imran", "Fatima", "Harpreet", "Simran",
  "Mohammed", "Ayesha", "Deepak", "Shreya", "Manoj", "Nisha",
];

const LAST = [
  "Sharma", "Kumar", "Singh", "Gupta", "Verma", "Yadav", "Khan", "Patel",
  "Reddy", "Joshi", "Malhotra", "Chopra", "Bansal", "Mehta", "Agarwal",
  "Das", "Roy", "Iyer", "Nair", "Bhatia", "Saxena", "Tiwari", "Mishra",
  "Ahmed", "Hussain", "Gill", "Dhillon", "Bose", "Kapoor", "Sethi",
];

export function assignName(seed: number): string {
  const rng = new SeededRng(seed ^ 0x517cc1b7);
  const first = FIRST[Math.floor(rng.next() * FIRST.length)];
  const last = LAST[Math.floor(rng.next() * LAST.length)];
  return `${first} ${last}`;
}
