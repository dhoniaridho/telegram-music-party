import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { HeroUIProvider, ToastProvider } from "@heroui/react";

createRoot(document.getElementById("root")!).render(
    <HeroUIProvider>
        <ToastProvider placement="top-center" />
        <StrictMode>
            <App />
        </StrictMode>
    </HeroUIProvider>
);

