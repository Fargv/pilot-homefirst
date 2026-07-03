import React from "react";
import { MemoryRouter } from "react-router-dom";

export default function KitchenProvider({ children }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
