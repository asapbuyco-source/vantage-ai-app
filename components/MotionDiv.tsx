import { motion, HTMLMotionProps } from 'framer-motion';
import React from 'react';

type MotionDivProps = HTMLMotionProps<'div'> & React.RefAttributes<HTMLDivElement>;

export const MotionDiv = motion.div as React.FC<MotionDivProps>;
