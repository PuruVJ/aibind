import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Nav from "./components/Nav";

export default function App() {
  return (
    <Router
      root={(props) => (
        <>
          <Nav />
          <main
            style={{ padding: "1rem", "max-width": "48rem", margin: "0 auto" }}
          >
            <Suspense>{props.children}</Suspense>
          </main>
        </>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
