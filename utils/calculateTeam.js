import moment from "moment";
import UserModel from "../models/user.model.js";

export const calculateTeams = async (userId, startDate = null, endDate = null) => {
  try {
    const user = await UserModel.findById(userId);
    if (!user) throw new Error("User not found");

    let dateFilter = {};
    if (startDate && endDate) {
      const start = moment(startDate).startOf("day").toDate();
      const end = moment(endDate).endOf("day").toDate();
      dateFilter.createdAt = { $gte: start, $lte: end };
    }

    // ✅ Fetch Team A
    const teamA = await UserModel.find({
      _id: { $in: user.referedUsers },
      ...dateFilter,
    }).populate("referedUsers");

    // ✅ Fetch Team B
    let teamB = [];
    for (let a of teamA) {
      const referredByA = await UserModel.find({
        _id: { $in: a.referedUsers },
        ...dateFilter,
      }).populate("referedUsers");
      teamB.push(...referredByA);
    }

    // ✅ Fetch Team C
    let teamC = [];
    for (let b of teamB) {
      const referredByB = await UserModel.find({
        _id: { $in: b.referedUsers },
        ...dateFilter,
      });
      teamC.push(...referredByB);
    }

    // ✅ Calculate investments
    const sumInvestments = (team) =>
      team.reduce((sum, member) => sum + (Number(member.totalInvestment) || 0), 0);

    const teamAInvestment = sumInvestments(teamA);
    const teamBInvestment = sumInvestments(teamB);
    const teamCInvestment = sumInvestments(teamC);
    const totalInvestment = teamAInvestment + teamBInvestment + teamCInvestment;

    return {
      teamA,
      teamB,
      teamC,
      totalTeamBC: teamB.length + teamC.length,
      teamAInvestment,
      teamBInvestment,
      teamCInvestment,
      totalInvestment,
    };
  } catch (error) {
    throw error;
  }
};
