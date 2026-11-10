import { mount } from "svelte";
import "@fontsource/permanent-marker";
import "@fontsource/caveat/600.css";
import "@fontsource/caveat/700.css";
import "@fontsource/vt323";
import "./app.css";
import App from "./App.svelte";

mount(App, { target: document.getElementById("app")! });
