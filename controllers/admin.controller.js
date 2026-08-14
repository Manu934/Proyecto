import Prueba from "../models/Prueba.js";

export const getPendientes = async (req, res) => {
  try {
    const pruebas = await Prueba.getPendientes();
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error", error: error.message });
  }
};

export const getRechazadas = async (req, res) => {
  try {
    const pruebas = await Prueba.getAllAdmin("rechazada");
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error", error: error.message });
  }
};

export const getAllPruebas = async (req, res) => {
  try {
    const estado = req.query.estado;
    const pruebas = await Prueba.getAllAdmin(estado);
    res.json({ ok: true, data: pruebas });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error", error: error.message });
  }
};

export const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;
    if (!["aprobada", "rechazada"].includes(estado)) {
      return res.status(400).json({ ok: false, message: "Estado inválido" });
    }
    await Prueba.updateEstado(id, estado);
    res.json({ ok: true, message: `Prueba ${estado} correctamente` });
  } catch (error) {
    res.status(500).json({ ok: false, message: "Error", error: error.message });
  }
};
