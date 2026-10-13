const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' })); // لدعم رفع الصور والفيديوهات الكبيرة

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// قواعد بيانات مؤقتة على السيرفر (يمكن ربطها بقاعدة بيانات حقيقية لاحقاً)
let users = {}; // تخزين الحسابات والبيانات
let onlineUsers = {}; // المستخدمين المتصلين حالياً

io.on('connection', (socket) => {
  console.log('مستخدم متصل:', socket.id);

  // 1. تسجيل حساب جديد
  socket.on('register', (data) => {
    if (users[data.username]) {
      socket.emit('auth_error', 'اسم المستخدم موجود مسبقاً!');
    } else {
      users[data.username] = {
        password: data.password,
        phone: data.phone,
        avatar: '',
        friends: [],
        requests: [],
        blocked: []
      };
      socket.emit('auth_success', { message: 'تم إنشاء الحساب بنجاح', username: data.username });
    }
  });

  // 2. تسجيل الدخول
  socket.on('login', (data) => {
    let user = users[data.username];
    if (user && user.password === data.password) {
      onlineUsers[data.username] = socket.id;
      socket.username = data.username;
      socket.emit('login_success', { username: data.username, userData: user });
      
      // إرسال تحديث لقائمة المستخدمين أونلاين
      io.emit('update_users_list', Object.keys(users));
    } else {
      socket.emit('auth_error', 'خطأ في اسم المستخدم أو كلمة المرور!');
    }
  });

  // 3. إرسال طلب صداقة
  socket.on('send_friend_request', (data) => {
    let targetUser = users[data.toUser];
    if (targetUser) {
      if (!targetUser.requests.includes(data.fromUser)) {
        targetUser.requests.push(data.fromUser);
        
        // إذا كان الطرف الآخر متصلاً، نرسل له إشعاراً فورياً
        let targetSocketId = onlineUsers[data.toUser];
        if (targetSocketId) {
          io.to(targetSocketId).emit('new_request', { fromUser: data.fromUser });
        }
        socket.emit('action_success', 'تم إرسال طلب الصداقة بنجاح');
      } else {
        socket.emit('action_error', 'تم إرسال الطلب مسبقاً');
      }
    } else {
      socket.emit('action_error', 'المستخدم غير موجود');
    }
  });

  // 4. قبول طلب الصداقة
  socket.on('accept_friend_request', (data) => {
    let user = users[data.username];
    let friend = data.friendName;

    if (user && users[friend]) {
      if (!user.friends.includes(friend)) user.friends.push(friend);
      if (!users[friend].friends.includes(data.username)) users[friend].friends.push(data.username);
      
      user.requests = user.requests.filter(r => r !== friend);
      
      socket.emit('load_user_data', user);
      
      let friendSocketId = onlineUsers[friend];
      if (friendSocketId) {
        io.to(friendSocketId).emit('friend_accepted', { username: data.username });
      }
    }
  });

  // 5. إرسال رسالة أو وسائط (صور/فيديوهات) أونلاين
  socket.on('send_message', (data) => {
    // data تحتوي على: sender, receiver, messageContent, type (text/image/video), time
    let receiverSocketId = onlineUsers[data.receiver];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('receive_message', data);
    }
  });

  // عند انقطاع الاتصال
  socket.on('disconnect', () => {
    if (socket.username) {
      delete onlineUsers[socket.username];
      console.log('مستخدم انقطع الاتصال:', socket.username);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`السيرفر يعمل الآن على البورت ${PORT}`);
});