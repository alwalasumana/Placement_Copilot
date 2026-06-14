import Roadmap from '../models/Roadmap.js';

export const getRoadmap = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const roadmap = await Roadmap.findOne({ sessionId, status: { $ne: 'archived' } }).sort({ createdAt: -1 });
    if (!roadmap) return res.status(404).json({ success: false, error: 'No roadmap found. Run analysis first.' });
    res.json({ success: true, data: roadmap });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateWeekProgress = async (req, res) => {
  try {
    const sessionId = req.sessionId;
    const { roadmapId, weekNumber, completed } = req.body;

    if (!roadmapId || weekNumber === undefined) {
      return res.status(400).json({ success: false, error: 'roadmapId and weekNumber are required' });
    }

    const roadmap = await Roadmap.findOne({ _id: roadmapId, sessionId });
    if (!roadmap) return res.status(404).json({ success: false, error: 'Roadmap not found' });

    const weekIdx = roadmap.weeks.findIndex(w => w.week === weekNumber);
    if (weekIdx === -1) return res.status(404).json({ success: false, error: `Week ${weekNumber} not found` });

    roadmap.weeks[weekIdx].completed = completed;
    if (completed) roadmap.weeks[weekIdx].completedAt = new Date();
    else roadmap.weeks[weekIdx].completedAt = undefined;

    const completedCount = roadmap.weeks.filter(w => w.completed).length;
    roadmap.progressPercentage = Math.round((completedCount / roadmap.weeks.length) * 100);

    // Next uncompleted week becomes current
    const nextIncomplete = roadmap.weeks.findIndex(w => !w.completed);
    roadmap.currentWeek = nextIncomplete >= 0 ? roadmap.weeks[nextIncomplete].week : roadmap.weeks.length;

    if (roadmap.progressPercentage === 100) roadmap.status = 'completed';
    else roadmap.status = 'active';

    await roadmap.save();

    res.json({
      success: true,
      message: `Week ${weekNumber} marked as ${completed ? 'completed' : 'incomplete'}`,
      progressPercentage: roadmap.progressPercentage,
      currentWeek: roadmap.currentWeek,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
