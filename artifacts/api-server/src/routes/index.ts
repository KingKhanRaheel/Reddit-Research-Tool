import { Router, type IRouter } from "express";
import healthRouter from "./health";
import reportsRouter from "./reports";
import apiKeysRouter from "./apiKeys";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(reportsRouter);
router.use(apiKeysRouter);
router.use(dashboardRouter);

export default router;
