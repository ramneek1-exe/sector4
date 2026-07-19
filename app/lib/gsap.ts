"use client";

// The one place GSAP plugins get registered. Client-only: importing this from a server
// component would turn its exports into client references (see the nav-constants lesson),
// so only "use client" components may import from here.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";

gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);

export { gsap, ScrollTrigger };
