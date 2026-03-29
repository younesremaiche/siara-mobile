const createError = require("http-errors");
const router = require("express").Router();

const pool = require("../db");

router.get("/wilayas", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `
        SELECT id, name
        FROM gis.admin_areas
        WHERE level = 'wilaya'
        ORDER BY name ASC
      `
    );

    return res.status(200).json({
      items: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:wilayaId/communes", async (req, res, next) => {
  try {
    const wilayaId = Number.parseInt(req.params.wilayaId, 10);
    if (!Number.isInteger(wilayaId) || wilayaId <= 0) {
      throw createError(400, "wilayaId must be a positive integer");
    }

    const wilayaResult = await pool.query(
      `
        SELECT id
        FROM gis.admin_areas
        WHERE id = $1
          AND level = 'wilaya'
        LIMIT 1
      `,
      [wilayaId]
    );

    if (wilayaResult.rows.length === 0) {
      throw createError(404, "Wilaya not found");
    }

    const result = await pool.query(
      `
        SELECT id, name
        FROM gis.admin_areas
        WHERE level = 'commune'
          AND parent_id = $1
        ORDER BY name ASC
      `,
      [wilayaId]
    );

    return res.status(200).json({
      items: result.rows.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
