"use client";

import { motion, AnimatePresence } from "framer-motion";

interface FormStepProps {
  children: React.ReactNode;
  stepKey: string | number;
  direction?: "forward" | "back";
}

const variants = {
  enter: (direction: "forward" | "back") => ({
    x: direction === "forward" ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: "forward" | "back") => ({
    x: direction === "forward" ? -60 : 60,
    opacity: 0,
  }),
};

export function FormStep({ children, stepKey, direction = "forward" }: FormStepProps) {
  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
