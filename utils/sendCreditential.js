import nodemailer from "nodemailer";

export const sendCredentials = async (email, name, password) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL,
                pass: process.env.EMAIL_PASSWORD,
            },
        });

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: "Welcome to Zetta Platform ",
            html: `
        <h3>Dear ${name},</h3>
        <p>You have successfully registered on the Zetta Platform.</p>
        <p><b>Email:</b> ${email}</p>
        <p><b>Password:</b> ${password}</p>
        <p><i>Please keep this information safe and do not share it with anyone.</i></p>
        <br/>
        <p>Thanks & Regards,<br/>Team Zetta</p>
      `,
        };

        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("❌ Email sending failed:", error.message);
    }
};
